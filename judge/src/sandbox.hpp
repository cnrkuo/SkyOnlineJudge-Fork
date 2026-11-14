#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "cgroup.hpp"

namespace judge::sandbox {

/**
 * Process-wide sandbox settings, fixed at start-up with `configure()`.
 */
struct Settings {
  /** The nsjail binary; a bare name is looked up in PATH. */
  std::string nsjail = "nsjail";
  /**
   * The executable that runs as PID 1 inside every jail (see `init_main`).
   * Normally the judge binary itself.
   */
  std::string init;
  /** When the judge runs as root, programs run as this uid/gid. */
  unsigned run_uid = 65534;
  unsigned run_gid = 65534;
  /**
   * When set, every jail gets a cgroup with a hard memory limit, and
   * memory-limit kills are reported as such. Without it, memory is bounded
   * by an address-space rlimit only.
   */
  std::optional<cgroup::MemoryCgroup> memory_cgroup;
};

void configure(const Settings& settings);

struct Limits {
  /** CPU time (user + system). */
  std::int64_t cpu_ms = 1000;
  /** Real time; guards against sleeping or blocked programs. */
  std::int64_t wall_ms = 4000;
  /**
   * Peak resident memory. With a memory cgroup the kernel also enforces it,
   * killing the program once it (plus its /tmp and some headroom) needs more.
   */
  std::int64_t memory_kb = 262144;
  /** Largest file (including stdout) the program may write. Rounded up to whole MiB. */
  std::int64_t output_kb = 65536;
  /** Processes and threads the program may have at once (RLIMIT_NPROC). */
  int max_processes = 64;
  /** Size of the private /tmp. */
  std::int64_t tmp_kb = 16384;
};

struct RunSpec {
  /** argv[0] is resolved inside the jail: absolute, or relative to the work directory. */
  std::vector<std::string> argv;
  std::vector<std::string> env;
  /** Host directory that becomes the program's working directory, `/box`. */
  std::string cwd;
  /** Host files for the standard streams; empty means /dev/null. */
  std::string stdin_path;
  std::string stdout_path;
  std::string stderr_path;
  Limits limits;

  /** Mount the work directory read-only (testcase runs) instead of read-write (compilation). */
  bool readonly_cwd = false;
  /** Install the syscall filter. */
  bool syscall_filter = true;
  /** Pin the program to one CPU so timings are comparable across machines. */
  bool single_cpu = true;
};

enum class Status {
  Exited,
  Signaled,
  TimeLimit,
  MemoryLimit,
  OutputLimit,
  /** Killed by the syscall filter. */
  Restricted,
  /** The sandbox itself failed; see `error`. */
  InternalError,
};

struct RunResult {
  Status status = Status::InternalError;
  int exit_code = 0;
  int signal = 0;
  std::int64_t cpu_ms = 0;
  std::int64_t wall_ms = 0;
  std::int64_t memory_kb = 0;
  std::string error;
};

/**
 * Runs one program to completion inside an nsjail jail.
 *
 * The jail has its own mount, PID, network, IPC, UTS, cgroup and user
 * namespaces. Its filesystem is built from scratch: /usr (and the /bin,
 * /lib, /lib64 links), the dynamic-linker cache, /etc/alternatives, three
 * device nodes, a private /tmp and the work directory as /box. Nothing else
 * of the host — testdata cache, captured output, the judge's config and
 * token — exists inside it. No network, no other processes. rlimits bound
 * CPU, output, processes and open files; memory is bounded by a cgroup when
 * one is configured, by an address-space rlimit otherwise. A seccomp policy
 * kills the program on dangerous system calls.
 *
 * The program does not run as PID 1 of its namespace: `init_main` does, and
 * reports the program's exact exit status and resource usage back. (The
 * kernel ignores most signals sent to a PID 1, which would otherwise turn an
 * output-limit kill into a plain exit, for instance.)
 */
RunResult run(const RunSpec& spec);

/** Argument that switches the executable into its in-jail init role. */
/** Exit statuses the sandbox itself produces, following the shell's conventions. */
inline constexpr int kExitInitFailed = 125;     // the init could not run or wait for the program
inline constexpr int kExitSetupFailed = 126;    // the standard streams could not be set up
inline constexpr int kExitCannotExecute = 127;  // the program (or nsjail) could not be executed

inline constexpr const char* kInitFlag = "--sandbox-init";

/**
 * Entry point of the in-jail init: `<exe> --sandbox-init <fd> <program> [args…]`.
 * Runs the program as its child, waits for it, writes the exit status and
 * resource usage to `fd`, and exits.
 */
int init_main(int argc, char** argv);

/** Human-readable name of a signal, e.g. "Segmentation fault". */
std::string signal_name(int signal);

}  // namespace judge::sandbox
