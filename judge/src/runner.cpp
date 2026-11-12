#include "runner.hpp"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <sstream>

#include <unistd.h>

#include "checker.hpp"
#include "sandbox.hpp"

namespace judge {
namespace {

namespace fs = std::filesystem;

const std::vector<std::string> kEnvironment = {
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "LANG=C.UTF-8",
    "HOME=/tmp",
    "ONLINE_JUDGE=1",
};

std::string read_text(const fs::path& path) {
  std::ifstream file(path, std::ios::binary);
  std::ostringstream buffer;
  buffer << file.rdbuf();
  return std::move(buffer).str();
}

/** Removes the task directory when judging ends, however it ends. */
struct ScopedDirectory {
  fs::path path;
  ~ScopedDirectory() {
    std::error_code ignored;
    fs::remove_all(path, ignored);
  }
};

Report failure(const Task& task, Verdict verdict, std::string message) {
  Report report;
  report.submission_id = task.submission_id;
  report.verdict = verdict;
  report.compile_message = std::move(message);
  return report;
}

TestResult to_result(const Testcase& testcase, const sandbox::RunResult& run, std::int64_t time_limit_ms,
                     const std::string& expected_path, const std::string& output_path) {
  TestResult result;
  result.testcase_id = testcase.id;
  result.time_ms = std::min(run.cpu_ms, time_limit_ms);
  result.memory_kb = run.memory_kb;

  switch (run.status) {
    case sandbox::Status::InternalError:
      result.verdict = Verdict::JudgeError;
      result.message = "Sandbox error: " + run.error;
      break;
    case sandbox::Status::TimeLimit:
      result.verdict = Verdict::TimeLimitExceeded;
      result.time_ms = time_limit_ms;
      break;
    case sandbox::Status::MemoryLimit:
      result.verdict = Verdict::MemoryLimitExceeded;
      break;
    case sandbox::Status::OutputLimit:
      result.verdict = Verdict::OutputLimitExceeded;
      break;
    case sandbox::Status::Restricted:
      result.verdict = Verdict::RestrictedFunction;
      result.message = "The program used a forbidden system call";
      break;
    case sandbox::Status::Signaled:
      result.verdict = Verdict::RuntimeError;
      result.message = format("Killed by signal %d (%s)", run.signal, sandbox::signal_name(run.signal).c_str());
      break;
    case sandbox::Status::Exited:
      if (run.exit_code != 0) {
        result.verdict = Verdict::RuntimeError;
        result.message = format("Exited with code %d", run.exit_code);
      } else {
        const checker::Outcome outcome = checker::compare_files(expected_path, output_path);
        result.verdict = outcome.verdict;
        result.score = outcome.score;
        result.message = outcome.message;
      }
      break;
  }
  return result;
}

}  // namespace

std::string Runner::testdata(const Testcase& testcase, bool input) {
  const std::string& hash = input ? testcase.input_sha256 : testcase.output_sha256;
  // The hash becomes a file name; make sure it is nothing but a hash.
  if (hash.size() != 64 || hash.find_first_not_of("0123456789abcdef") != std::string::npos) {
    throw ApiError("testcase has a malformed content hash");
  }
  const std::string path = (fs::path(config_.cache_dir) / hash).string();
  if (!fs::exists(path)) api_.download_testdata(testcase.id, input ? "input" : "output", path);
  return path;
}

Report Runner::judge(const Task& task) {
  const auto language = config_.languages.find(task.language);
  if (language == config_.languages.end()) {
    return failure(task, Verdict::JudgeError, "This judge does not support language \"" + task.language + "\"");
  }
  const LanguageSpec& spec = language->second;

  const fs::path root = fs::path(config_.work_dir) / format("%d-%d", task.submission_id, static_cast<int>(::getpid()));
  const fs::path box = root / "box";
  const fs::path io = root / "io";
  ScopedDirectory cleanup{root};
  try {
    fs::remove_all(root);
    fs::create_directories(box);
    fs::create_directories(io);
    // The program's uid must traverse into the box but never into io/.
    fs::permissions(root, fs::perms::owner_all | fs::perms::group_exec | fs::perms::others_exec);
    fs::permissions(io, fs::perms::owner_all);
    fs::permissions(box, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec |
                             fs::perms::others_read | fs::perms::others_exec);
    std::ofstream(box / spec.source, std::ios::binary) << task.code;
    if (::geteuid() == 0) {
      // The compiler runs as the unprivileged uid and writes into the box.
      if (::chown(box.c_str(), config_.run_uid, config_.run_gid) != 0) throw fs::filesystem_error("chown", box, {});
    }
  } catch (const fs::filesystem_error& error) {
    return failure(task, Verdict::JudgeError, std::string("Cannot prepare the work directory: ") + error.what());
  }

  sandbox::RunSpec base;
  base.env = kEnvironment;
  base.cwd = box.string();
  base.run_uid = config_.run_uid;
  base.run_gid = config_.run_gid;
  base.require_isolation = config_.require_isolation;
  base.limits.max_processes = config_.max_processes;
  // Expected answers, captured output and the judge token stay out of reach.
  base.masked_paths = {config_.cache_dir, io.string()};
  if (!config_.source_path.empty()) base.masked_paths.push_back(config_.source_path);

  // ------------------------------------------------------------------ compile
  if (!spec.compile.empty()) {
    const std::string log_path = (io / "compile.log").string();
    sandbox::RunSpec compile = base;
    compile.argv = spec.compile;
    compile.stdout_path = log_path;
    compile.stderr_path = log_path;
    compile.syscall_filter = false;  // compilers fork, exec and use pipes freely
    compile.limits.cpu_ms = config_.compile_time_ms;
    compile.limits.wall_ms = config_.compile_time_ms * 2;
    compile.limits.memory_kb = config_.compile_memory_kb;
    compile.limits.output_kb = 262144;
    compile.limits.max_processes = std::max(config_.max_processes, 256);

    const sandbox::RunResult built = sandbox::run(compile);
    const std::string output = read_text(log_path);
    switch (built.status) {
      case sandbox::Status::InternalError:
        return failure(task, Verdict::JudgeError, "Sandbox error: " + built.error);
      case sandbox::Status::TimeLimit:
        return failure(task, Verdict::CompileError, "Compilation timed out\n" + output);
      case sandbox::Status::MemoryLimit:
        return failure(task, Verdict::CompileError, "Compilation ran out of memory\n" + output);
      case sandbox::Status::Exited:
        if (built.exit_code == 0) break;
        [[fallthrough]];
      default:
        return failure(task, Verdict::CompileError, output.empty() ? "Compilation failed" : output);
    }
  }

  // ---------------------------------------------------------------------- run
  Report report;
  report.submission_id = task.submission_id;
  const std::string output_path = (io / "stdout").string();
  for (const Testcase& testcase : task.testcases) {
    sandbox::RunSpec run = base;
    run.argv = spec.run;
    run.stdin_path = testdata(testcase, true);
    run.stdout_path = output_path;
    run.readonly_cwd = true;
    run.limits.cpu_ms = task.time_limit_ms;
    run.limits.wall_ms = task.time_limit_ms * 2 + 1000;
    run.limits.memory_kb = task.memory_limit_kb;
    run.limits.output_kb = config_.output_limit_kb;

    const std::string expected_path = testdata(testcase, false);
    report.results.push_back(to_result(testcase, sandbox::run(run), task.time_limit_ms, expected_path, output_path));
  }
  return report;
}

}  // namespace judge
