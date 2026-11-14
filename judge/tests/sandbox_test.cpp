#include <doctest.h>

#include <chrono>
#include <csignal>
#include <cstdlib>
#include <thread>

#include "common.hpp"
#include "sandbox.hpp"
#include "support.hpp"

namespace fs = std::filesystem;
using judge::sandbox::run;
using judge::sandbox::RunResult;
using judge::sandbox::RunSpec;
using judge::sandbox::Status;

namespace {

/**
 * A shell script run in `<dir>/box`, writing to `<dir>/out` — outside the
 * box, like the judge's private io/ directory.
 */
struct Jail {
  fs::path dir;
  fs::path box;

  explicit Jail(const std::string& name) : dir(judge::testing::fresh_dir(name)), box(dir / "box") {
    fs::create_directories(box);
    fs::permissions(box, fs::perms::all);
  }

  [[nodiscard]] RunSpec shell(const std::string& script) const {
    RunSpec spec;
    spec.argv = {"/bin/sh", "-c", script};
    spec.env = {"PATH=/usr/bin:/bin"};
    spec.cwd = box.string();
    spec.stdout_path = (dir / "out").string();
    spec.limits.cpu_ms = 2000;
    spec.limits.wall_ms = 5000;
    spec.limits.memory_kb = 262144;
    spec.limits.output_kb = 1024;
    return spec;
  }

  [[nodiscard]] RunResult run_shell(const std::string& script) const { return run(shell(script)); }
  [[nodiscard]] std::string out() const { return judge::read_file((dir / "out").string()).value_or(""); }
};

}  // namespace

TEST_CASE("the sandbox runs a program with the box as its working directory") {
  const Jail jail("sandbox-run");
  judge::testing::write_file(jail.box / "in", "20 22\n");
  const RunResult sum = jail.run_shell("read a b < in; echo $((a + b))");
  INFO(sum.error);
  CHECK(sum.status == Status::Exited);
  CHECK(sum.exit_code == 0);
  CHECK(jail.out() == "42\n");
}

TEST_CASE("the sandbox feeds stdin from a file") {
  const Jail jail("sandbox-stdin");
  judge::testing::write_file(jail.box / "in", "20 22\n");
  RunSpec spec = jail.shell("read a b; echo $((a * b))");
  spec.stdin_path = (jail.box / "in").string();
  CHECK(run(spec).status == Status::Exited);
  CHECK(jail.out() == "440\n");
}

TEST_CASE("the sandbox reports exit codes and signals as they happened") {
  const Jail jail("sandbox-exit");
  const RunResult failed = jail.run_shell("exit 3");
  CHECK(failed.status == Status::Exited);
  CHECK(failed.exit_code == 3);

  // The program is not PID 1 of its namespace, so it can signal itself to death.
  const RunResult crashed = jail.run_shell("kill -SEGV $$; echo survived");
  CHECK(crashed.status == Status::Signaled);
  CHECK(crashed.signal == SIGSEGV);
  CHECK(jail.out().empty());
  CHECK(jail.run_shell("kill -ABRT $$").signal == SIGABRT);

  // A missing program is the program's failure, not the sandbox's.
  const RunResult missing = jail.run_shell("exec /no/such/program");
  CHECK(missing.status == Status::Exited);
  CHECK(missing.exit_code == judge::sandbox::kExitCannotExecute);
}

TEST_CASE("the sandbox enforces the time limits") {
  const Jail jail("sandbox-time");
  RunSpec asleep = jail.shell("sleep 10");
  asleep.limits.wall_ms = 300;
  const RunResult slept = run(asleep);
  CHECK(slept.status == Status::TimeLimit);
  CHECK(slept.wall_ms < 3000);
  // A jail stopped at the wall-clock limit leaves no cgroup behind.
  if (const auto& cgroup = judge::testing::sandbox_settings().memory_cgroup) {
    for (const auto& entry : fs::directory_iterator(cgroup->path)) {
      CHECK_MESSAGE(!entry.path().filename().string().starts_with("NSJAIL."), entry.path().string());
    }
  }

  RunSpec spinning = jail.shell("while :; do :; done");
  spinning.limits.cpu_ms = 300;
  CHECK(run(spinning).status == Status::TimeLimit);
}

TEST_CASE("the sandbox enforces the output limit") {
  const Jail jail("sandbox-output");
  // Writing past the output limit is SIGXFSZ, i.e. Output Limit Exceeded.
  CHECK(jail.run_shell("exec yes").status == Status::OutputLimit);
  CHECK(fs::file_size(jail.dir / "out") <= std::uintmax_t{1024} * 1024);
}

namespace {

/** Python touching `mb` MiB at once, under a 128 MiB limit. */
RunResult use_memory(const Jail& jail, int mb) {
  RunSpec spec = jail.shell(judge::format("exec python3 -c 'b = bytearray(%d * 1024 * 1024); print(len(b))'", mb));
  spec.limits.memory_kb = 131072;
  return run(spec);
}

/** Python reserving 1 GiB of address space without touching it, under a 128 MiB limit. */
RunResult reserve_memory(const Jail& jail) {
  RunSpec spec = jail.shell(R"(exec python3 -c 'import mmap; m = mmap.mmap(-1, 1 << 30); print("ok")')");
  spec.limits.memory_kb = 131072;
  return run(spec);
}

bool has_memory_cgroup() {
  if (judge::testing::sandbox_settings().memory_cgroup) return true;
  MESSAGE("skipped: no memory cgroup (run the tests as root)");
  return false;
}

}  // namespace

TEST_CASE("with a memory cgroup, any use beyond the limit is a memory-limit verdict") {
  if (!has_memory_cgroup()) return;
  const Jail jail("sandbox-cgroup");
  const RunResult hungry = use_memory(jail, 400);
  INFO(hungry.error);
  CHECK(hungry.status == Status::MemoryLimit);
  CHECK(use_memory(jail, 40).status == Status::Exited);
}

TEST_CASE("with a memory cgroup, only memory that is used counts") {
  if (!has_memory_cgroup()) return;
  const Jail jail("sandbox-reserve");
  const RunResult reserved = reserve_memory(jail);
  CHECK(reserved.status == Status::Exited);
  CHECK(reserved.exit_code == 0);
  CHECK(jail.out() == "ok\n");
}

TEST_CASE("without a memory cgroup, an address-space limit bounds memory") {
  auto settings = judge::testing::sandbox_settings();
  settings.memory_cgroup.reset();
  const judge::testing::ScopedSandbox rlimits_only(settings);
  const Jail jail("sandbox-rlimits");

  const RunResult hungry = use_memory(jail, 400);
  // The allocation fails outright, or succeeds and peak RSS is over the limit.
  CHECK((hungry.status == Status::MemoryLimit || (hungry.status == Status::Exited && hungry.exit_code != 0)));
  // Reserving more address space than the limit allows fails.
  const RunResult reserved = reserve_memory(jail);
  CHECK(reserved.status == Status::Exited);
  CHECK(reserved.exit_code != 0);
}

TEST_CASE("the syscall policy kills escape attempts and fails sockets softly") {
  const Jail jail("sandbox-seccomp");
  const RunResult escape = jail.run_shell("exec unshare -U true");
  CHECK(escape.status == Status::Restricted);
  CHECK(escape.signal == SIGSYS);

  const RunResult sock = jail.run_shell("python3 -c 'import socket; socket.socket()' 2>&1; echo rc=$?");
  CHECK(sock.status == Status::Exited);
  CHECK(jail.out().find("Operation not permitted") != std::string::npos);
}

TEST_CASE("the program sees only /usr, its box and a private /tmp") {
  const Jail jail("sandbox-fs");
  judge::testing::write_file(jail.dir / "secret", "expected answer\n");
  CHECK(jail.run_shell("cat ../secret /etc/passwd 2>/dev/null; ls /; echo end").status == Status::Exited);
  const std::string listing = jail.out();
  CHECK(listing.find("expected answer") == std::string::npos);
  CHECK(listing.find("home") == std::string::npos);
  CHECK(listing.find("box") != std::string::npos);
  CHECK(listing.find("end") != std::string::npos);

  RunSpec readonly = jail.shell("echo x > created; echo t > /tmp/t && cat /tmp/t");
  readonly.readonly_cwd = true;
  CHECK(run(readonly).status == Status::Exited);
  CHECK_FALSE(fs::exists(jail.box / "created"));
  CHECK(jail.out() == "t\n");
}

TEST_CASE("the program is alone: no network but loopback, no other processes, nothing outlives it") {
  const Jail jail("sandbox-alone");
  CHECK(jail.run_shell("ls /sys/class/net 2>/dev/null | grep -v '^lo$'; ls /proc | grep -c '^[0-9]'").status ==
        Status::Exited);
  CHECK(std::atoi(jail.out().c_str()) <= 4);  // init, sh, ls, grep

  CHECK(jail.run_shell("(sleep 2; echo late > straggler) & exit 0").status == Status::Exited);
  std::this_thread::sleep_for(std::chrono::milliseconds(2500));
  CHECK_FALSE(fs::exists(jail.box / "straggler"));
}

TEST_CASE("the sandbox refuses a run it cannot describe") {
  const RunResult result = run(RunSpec{});
  CHECK(result.status == Status::InternalError);
  CHECK(result.error == "empty argv");
}
