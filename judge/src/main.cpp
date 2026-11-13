// skyoj-judge — judge machine daemon for Sky Online Judge.
//
// Polls the API for queued submissions, judges them in a sandbox and reports
// the per-testcase results. Any number of judges can serve one API; the
// queue hands each submission to exactly one of them.

#include <algorithm>
#include <chrono>
#include <csignal>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <filesystem>
#include <fstream>
#include <string>
#include <thread>

#include <unistd.h>

#include "api_client.hpp"
#include "common.hpp"
#include "config.hpp"
#include "runner.hpp"
#include "sandbox.hpp"

namespace {

volatile std::sig_atomic_t g_stop = 0;

void request_stop(int) {
  g_stop = 1;
}

/** Sleeps in short slices so a termination signal is honoured promptly. */
void idle(int milliseconds) {
  for (int waited = 0; waited < milliseconds && !g_stop; waited += 100) {
    std::this_thread::sleep_for(std::chrono::milliseconds(std::min(100, milliseconds - waited)));
  }
}

void usage(const char* program) {
  std::fprintf(stderr,
               "Usage: %s [--config FILE] [--once]\n"
               "  --config FILE  JSON configuration (see config.example.json)\n"
               "  --once         judge at most one submission, then exit\n"
               "Environment: SKYOJ_API_URL, SKYOJ_JUDGE_TOKEN override the file.\n",
               program);
}

/**
 * Runs a trivial program through nsjail before accepting work. Catches a
 * missing or broken nsjail, a kernel without user namespaces, and the classic
 * misconfiguration where the jail cannot reach `work_dir` or the judge
 * binary (nsjail mounts them from inside a user namespace, so every parent
 * directory must be searchable by the submissions' uid: chmod o+x).
 */
void probe_sandbox(const judge::Config& config) {
  namespace fs = std::filesystem;
  const fs::path dir = fs::path(config.work_dir) / ".probe";
  std::error_code ignored;
  fs::remove_all(dir, ignored);
  fs::create_directories(dir);
  fs::permissions(dir, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read |
                           fs::perms::others_exec);
  std::ofstream(dir / "probe") << "ok\n";
  fs::permissions(dir / "probe", fs::perms::owner_all | fs::perms::group_read | fs::perms::others_read);

  judge::sandbox::RunSpec probe;
  probe.argv = {"/bin/cat", "probe"};
  probe.cwd = dir.string();
  probe.readonly_cwd = true;
  const judge::sandbox::RunResult result = judge::sandbox::run(probe);
  fs::remove_all(dir, ignored);

  if (result.status != judge::sandbox::Status::Exited || result.exit_code != 0) {
    judge::log("FATAL", "sandbox self-test failed: " +
                            (result.error.empty() ? judge::format("probe ended with status %d", result.exit_code) : result.error));
    std::exit(1);
  }
}

}  // namespace

int main(int argc, char** argv) {
  // Inside a jail this binary is the init process, not the daemon.
  if (argc >= 2 && !std::strcmp(argv[1], judge::sandbox::kInitFlag)) return judge::sandbox::init_main(argc, argv);

  std::string config_path;
  bool once = false;
  for (int i = 1; i < argc; ++i) {
    if (!std::strcmp(argv[i], "--config") && i + 1 < argc) {
      config_path = argv[++i];
    } else if (!std::strcmp(argv[i], "--once")) {
      once = true;
    } else {
      usage(argv[0]);
      return !std::strcmp(argv[i], "--help") || !std::strcmp(argv[i], "-h") ? 0 : 2;
    }
  }

  try {
    const judge::Config config = judge::load_config(config_path);

    namespace fs = std::filesystem;
    fs::create_directories(config.work_dir);
    fs::create_directories(config.cache_dir);
    // Submissions traverse work_dir to reach their box; the cache holds the
    // expected answers and is for the judge's eyes only.
    fs::permissions(config.work_dir, fs::perms::owner_all | fs::perms::group_exec | fs::perms::others_exec);
    fs::permissions(config.cache_dir, fs::perms::owner_all);

    judge::sandbox::configure({
        .nsjail = config.nsjail_path,
        .init = fs::canonical("/proc/self/exe").string(),
        .run_uid = config.run_uid,
        .run_gid = config.run_gid,
    });
    probe_sandbox(config);
    judge::log("INFO", "sandbox: nsjail (" + config.nsjail_path + "), namespaces + seccomp + rlimits");

    std::signal(SIGINT, request_stop);
    std::signal(SIGTERM, request_stop);
    std::signal(SIGPIPE, SIG_IGN);

    judge::ApiClient api(config.api_url, config.token);
    judge::Runner runner(config, api);
    judge::log("INFO", "judging for " + config.api_url);

    while (!g_stop) {
      try {
        const auto task = api.fetch();
        if (!task) {
          if (once) break;
          idle(config.poll_interval_ms);
          continue;
        }
        judge::log("INFO", judge::format("submission %d (%s, %zu testcases)", task->submission_id,
                                         task->language.c_str(), task->testcases.size()));
        judge::Report report;
        try {
          report = runner.judge(*task);
        } catch (const std::exception& error) {
          // Infrastructure trouble (e.g. testdata download); tell the API so
          // the submission is not left hanging until the claim times out.
          report = judge::Report{task->submission_id, judge::Verdict::JudgeError, error.what(), {}};
        }
        api.report(report);
        if (once) break;
      } catch (const judge::ApiError& error) {
        judge::log("ERROR", error.what());
        if (once) return 1;
        idle(3000);
      }
    }
    judge::log("INFO", "stopped");
    return 0;
  } catch (const std::exception& error) {
    judge::log("FATAL", error.what());
    return 1;
  }
}
