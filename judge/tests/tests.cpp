// Self-contained tests for the checker and the sandbox (no framework).
// Sandbox cases adapt to the host: assertions that need namespaces are
// skipped, with a note, where the kernel refuses to create them.

#include <chrono>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>

#include "checker.hpp"
#include "sandbox.hpp"

namespace fs = std::filesystem;
using judge::Verdict;
using judge::sandbox::Status;

namespace {

int g_failures = 0;

#define CHECK(condition)                                                    \
  do {                                                                      \
    if (!(condition)) {                                                     \
      std::fprintf(stderr, "FAIL %s:%d: %s\n", __FILE__, __LINE__, #condition); \
      ++g_failures;                                                         \
    }                                                                       \
  } while (0)

std::string slurp(const fs::path& path) {
  std::ifstream file(path);
  std::ostringstream buffer;
  buffer << file.rdbuf();
  return buffer.str();
}

void test_checker() {
  using judge::checker::compare;
  CHECK(compare("1 2\n3\n", "1 2\n3\n").verdict == Verdict::Accepted);
  CHECK(compare("1 2\n3\n", "1 2  \r\n3").verdict == Verdict::Accepted);        // trailing whitespace, CRLF
  CHECK(compare("1 2\n3\n", "1 2\n3\n\n\n").verdict == Verdict::Accepted);      // trailing blank lines
  CHECK(compare("", "").verdict == Verdict::Accepted);
  CHECK(compare("1 2\n3\n", "1\n2\n3\n").verdict == Verdict::PresentationError); // same tokens, other layout
  CHECK(compare("1 2\n", " 1 2\n").verdict == Verdict::PresentationError);       // leading whitespace matters
  CHECK(compare("1 2\n3\n", "1 2\n4\n").verdict == Verdict::WrongAnswer);
  CHECK(compare("1 2\n3\n", "1 2\n4\n").message == "Line 2 differs");
  CHECK(compare("1\n2\n", "1\n").verdict == Verdict::WrongAnswer);
  CHECK(compare("1\n", "1\n2\n").verdict == Verdict::WrongAnswer);
  CHECK(compare("abc", "ABC").verdict == Verdict::WrongAnswer);
  CHECK(compare("1\n", "1\n").score == 1.0);
  CHECK(compare("1\n", "2\n").score == 0.0);
}

judge::sandbox::RunSpec shell(const fs::path& dir, const std::string& script) {
  judge::sandbox::RunSpec spec;
  spec.argv = {"/bin/sh", "-c", script};
  spec.env = {"PATH=/usr/bin:/bin"};
  spec.cwd = dir.string();
  spec.stdout_path = (dir / "out").string();
  spec.limits.cpu_ms = 2000;
  spec.limits.wall_ms = 5000;
  spec.limits.memory_kb = 262144;
  spec.limits.output_kb = 1024;
  return spec;
}

void test_sandbox(const fs::path& dir) {
  using judge::sandbox::run;

  auto ok = run(shell(dir, "read a b; echo $((a + b))"));
  CHECK(ok.status == Status::Exited);  // stdin is /dev/null: read fails, prints 0
  if (ok.status == Status::InternalError) std::fprintf(stderr, "sandbox error: %s\n", ok.error.c_str());
  const bool isolated = ok.isolated;
  if (!isolated) std::fprintf(stderr, "note: namespaces unavailable, isolation checks skipped\n");

  std::ofstream(dir / "in") << "20 22\n";
  auto spec = shell(dir, "read a b; echo $((a + b))");
  spec.stdin_path = (dir / "in").string();
  auto sum = run(spec);
  CHECK(sum.status == Status::Exited && sum.exit_code == 0);
  CHECK(slurp(dir / "out") == "42\n");

  auto failed = run(shell(dir, "exit 3"));
  CHECK(failed.status == Status::Exited && failed.exit_code == 3);

  auto crashed = run(shell(dir, "kill -SEGV $$"));
  CHECK(crashed.status == Status::Signaled && crashed.signal == SIGSEGV);

  spec = shell(dir, "sleep 10");
  spec.limits.wall_ms = 300;
  auto asleep = run(spec);
  CHECK(asleep.status == Status::TimeLimit);
  CHECK(asleep.wall_ms < 3000);

  spec = shell(dir, "while :; do :; done");
  spec.limits.cpu_ms = 300;
  spec.limits.wall_ms = 5000;
  auto spinning = run(spec);
  CHECK(spinning.status == Status::TimeLimit);
  CHECK(spinning.cpu_ms >= 300);

  spec = shell(dir, "exec yes");
  spec.limits.output_kb = 64;
  auto noisy = run(spec);
  CHECK(noisy.status == Status::OutputLimit);
  CHECK(fs::file_size(dir / "out") <= 64 * 1024);

  auto missing = run(shell(dir / "does-not-exist", "true"));
  CHECK(missing.status == Status::InternalError);
  CHECK(!missing.error.empty());

  // Syscall filter: creating a namespace is a restricted function.
  auto escape = run(shell(dir, "unshare -U true"));
  CHECK(escape.status == Status::Restricted || (escape.status == Status::Exited && escape.exit_code != 0));

  if (isolated) {
    const fs::path secret_dir = dir / "secret";
    fs::create_directories(secret_dir);
    std::ofstream(secret_dir / "answer") << "42\n";
    std::ofstream(dir / "token") << "hunter2\n";

    spec = shell(dir, "cat secret/answer; cat token; echo done");
    spec.masked_paths = {secret_dir.string(), (dir / "token").string()};
    auto masked = run(spec);
    CHECK(masked.status == Status::Exited);
    CHECK(slurp(dir / "out") == "done\n");  // neither file leaked

    spec = shell(dir, "echo x > created && echo wrote");
    spec.readonly_cwd = true;
    auto readonly = run(spec);
    CHECK(readonly.status == Status::Exited && readonly.exit_code != 0);
    CHECK(!fs::exists(dir / "created"));

    // A background child must not outlive the run.
    spec = shell(dir, "(sleep 2; echo late > straggler) & exit 0");
    auto parent = run(spec);
    CHECK(parent.status == Status::Exited);
    std::this_thread::sleep_for(std::chrono::milliseconds(2500));
    CHECK(!fs::exists(dir / "straggler"));
  }
}

}  // namespace

int main() {
  test_checker();

  char pattern[] = "/tmp/skyoj-judge-test-XXXXXX";
  const char* created = ::mkdtemp(pattern);
  if (!created) {
    std::perror("mkdtemp");
    return 1;
  }
  const fs::path dir = created;
  // The sandbox may demote the child to another uid; let it reach the files.
  fs::permissions(dir, fs::perms::all);
  test_sandbox(dir);
  std::error_code ignored;
  fs::remove_all(dir, ignored);

  if (g_failures == 0) std::puts("all tests passed");
  return g_failures == 0 ? 0 : 1;
}
