// Self-contained tests for the checker and the nsjail sandbox (no framework).
// Needs nsjail on PATH (or NSJAIL=/path/to/nsjail).

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
  // Output goes outside the box, like the judge's private io/ directory.
  spec.stdout_path = (dir.parent_path() / "out").string();
  spec.limits.cpu_ms = 2000;
  spec.limits.wall_ms = 5000;
  spec.limits.memory_kb = 262144;
  spec.limits.output_kb = 1024;
  return spec;
}

std::string out(const fs::path& dir) {
  return slurp(dir.parent_path() / "out");
}

void test_sandbox(const fs::path& dir) {
  using judge::sandbox::run;

  std::ofstream(dir / "in") << "20 22\n";
  auto spec = shell(dir, "read a b < in; echo $((a + b))");
  auto sum = run(spec);
  CHECK(sum.status == Status::Exited && sum.exit_code == 0);
  if (sum.status == Status::InternalError) std::fprintf(stderr, "sandbox error: %s\n", sum.error.c_str());
  CHECK(out(dir) == "42\n");

  spec = shell(dir, "read a b; echo $((a * b))");
  spec.stdin_path = (dir / "in").string();
  CHECK(run(spec).status == Status::Exited && out(dir) == "440\n");

  auto failed = run(shell(dir, "exit 3"));
  CHECK(failed.status == Status::Exited && failed.exit_code == 3);

  // The program is not PID 1 of its namespace, so signals behave normally:
  // a process can signal itself to death, and abort() is reported as SIGABRT.
  auto crashed = run(shell(dir, "kill -SEGV $$; echo survived"));
  CHECK(crashed.status == Status::Signaled && crashed.signal == SIGSEGV);
  CHECK(out(dir).empty());
  auto aborted = run(shell(dir, "kill -ABRT $$"));
  CHECK(aborted.status == Status::Signaled && aborted.signal == SIGABRT);

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

  // Writing past the output limit is SIGXFSZ, i.e. Output Limit Exceeded.
  auto noisy = run(shell(dir, "exec yes"));
  CHECK(noisy.status == Status::OutputLimit);
  CHECK(fs::file_size(dir.parent_path() / "out") <= 1024 * 1024);

  spec = shell(dir, "exec python3 -c 'b = bytearray(400 * 1024 * 1024); print(len(b))'");
  spec.limits.memory_kb = 131072;
  auto hungry = run(spec);
  CHECK(hungry.status == Status::MemoryLimit || (hungry.status == Status::Exited && hungry.exit_code != 0));

  // Syscall policy: creating a namespace kills (Restricted Function); sockets just fail.
  auto escape = run(shell(dir, "exec unshare -U true"));
  CHECK(escape.status == Status::Restricted && escape.signal == SIGSYS);
  auto sock = run(shell(dir, "python3 -c 'import socket; socket.socket()' 2>&1; echo rc=$?"));
  CHECK(sock.status == Status::Exited && out(dir).find("Operation not permitted") != std::string::npos);

  // Filesystem: only /usr, the box and a private /tmp exist.
  std::ofstream(dir.parent_path() / "secret") << "expected answer\n";
  auto look = run(shell(dir, "cat ../secret /etc/passwd 2>/dev/null; ls /; echo end"));
  CHECK(look.status == Status::Exited);
  CHECK(out(dir).find("expected answer") == std::string::npos);
  CHECK(out(dir).find("home") == std::string::npos && out(dir).find("var") == std::string::npos);
  CHECK(out(dir).find("box") != std::string::npos && out(dir).find("end") != std::string::npos);

  // No network interface but loopback, no other processes.
  auto alone = run(shell(dir, "ls /sys/class/net 2>/dev/null | grep -v '^lo$'; ls /proc | grep -c '^[0-9]'"));
  CHECK(alone.status == Status::Exited);
  CHECK(std::atoi(out(dir).c_str()) <= 4);  // init, sh, ls, grep

  // Testcase runs see the box read-only; /tmp is private and writable.
  spec = shell(dir, "echo x > created; echo t > /tmp/t && cat /tmp/t");
  spec.readonly_cwd = true;
  auto readonly = run(spec);
  CHECK(readonly.status == Status::Exited);
  CHECK(!fs::exists(dir / "created") && out(dir) == "t\n");

  // A background child does not outlive the run.
  auto parent = run(shell(dir, "(sleep 2; echo late > straggler) & exit 0"));
  CHECK(parent.status == Status::Exited);
  std::this_thread::sleep_for(std::chrono::milliseconds(2500));
  CHECK(!fs::exists(dir / "straggler"));

  // A missing program is the program's failure (127), not the sandbox's.
  auto missing = run(shell(dir, "exec /no/such/program"));
  CHECK(missing.status == Status::Exited && missing.exit_code == 127);
}

/** Compiles and runs C++23 inside the sandbox, as the judge does. */
void test_cpp23(const fs::path& dir) {
  std::ofstream(dir / "main.cpp") << R"(#include <expected>
#include <iostream>
#include <ranges>
std::expected<int, const char*> half(int n) {
  if (n % 2) return std::unexpected("odd");
  return n / 2;
}
int main() {
  auto squares = std::views::iota(1, 5) | std::views::transform([](int x) { return x * x; });
  for (int s : squares) std::cout << s << ' ';
  std::cout << half(8).value_or(-1) << ' ' << half(7).error() << '\n';
}
)";
  judge::sandbox::RunSpec compile;
  compile.argv = {"/usr/bin/g++", "-std=c++23", "-O2", "-o", "main", "main.cpp"};
  compile.env = {"PATH=/usr/bin:/bin", "HOME=/tmp"};
  compile.cwd = dir.string();
  compile.stdout_path = compile.stderr_path = (dir.parent_path() / "out").string();
  compile.single_cpu = false;
  compile.limits = {.cpu_ms = 30000, .wall_ms = 60000, .memory_kb = 2097152, .output_kb = 65536, .max_processes = 256, .tmp_kb = 524288};
  auto built = judge::sandbox::run(compile);
  CHECK(built.status == Status::Exited && built.exit_code == 0);
  if (built.exit_code != 0) std::fprintf(stderr, "compile output:\n%s\n%s\n", out(dir).c_str(), built.error.c_str());

  judge::sandbox::RunSpec program;
  program.argv = {"./main"};
  program.cwd = dir.string();
  program.stdout_path = (dir.parent_path() / "out").string();
  program.readonly_cwd = true;
  auto ran = judge::sandbox::run(program);
  CHECK(ran.status == Status::Exited && out(dir) == "1 4 9 16 4 odd\n");
}

}  // namespace

int main(int argc, char** argv) {
  // The sandbox uses this binary as the init process inside each jail.
  if (argc >= 2 && std::string(argv[1]) == judge::sandbox::kInitFlag) return judge::sandbox::init_main(argc, argv);

  test_checker();

  // Somewhere every uid can traverse: nsjail mounts the box from inside a user namespace.
  char pattern[] = "/var/tmp/skyoj-judge-test-XXXXXX";
  const char* created = ::mkdtemp(pattern);
  if (!created) {
    std::perror("mkdtemp");
    return 1;
  }
  const fs::path root = created;
  const fs::path box = root / "box";
  fs::create_directories(box);
  fs::permissions(root, fs::perms::owner_all | fs::perms::others_exec | fs::perms::group_exec);
  // Programs run as another uid and write into the box during compilation.
  fs::permissions(box, fs::perms::all);

  judge::sandbox::configure({
      .nsjail = std::getenv("NSJAIL") ? std::getenv("NSJAIL") : "nsjail",
      .init = fs::canonical("/proc/self/exe").string(),
  });
  test_sandbox(box);
  test_cpp23(box);
  std::error_code ignored;
  fs::remove_all(root, ignored);

  if (g_failures == 0) std::puts("all tests passed");
  return g_failures == 0 ? 0 : 1;
}
