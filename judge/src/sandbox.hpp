#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace judge::sandbox {

struct Limits {
  /** CPU time (user + system). */
  std::int64_t cpu_ms = 1000;
  /** Real time; guards against sleeping or blocked programs. */
  std::int64_t wall_ms = 4000;
  /** Peak resident memory. */
  std::int64_t memory_kb = 262144;
  /** Largest file (including stdout) the program may write. */
  std::int64_t output_kb = 65536;
  /** RLIMIT_NPROC; only enforced when the program runs under a dedicated uid. */
  int max_processes = 64;
};

struct RunSpec {
  /** argv[0] must be an absolute path or relative to `cwd`. */
  std::vector<std::string> argv;
  std::vector<std::string> env;
  std::string cwd;
  /** Empty paths are redirected to /dev/null. */
  std::string stdin_path;
  std::string stdout_path;
  std::string stderr_path;
  Limits limits;

  /** Remount `cwd` read-only for the program (needs namespaces). */
  bool readonly_cwd = false;
  /** Files/directories hidden from the program (needs namespaces). */
  std::vector<std::string> masked_paths;
  /** Install the syscall filter. Disabled for compilers, which fork and exec. */
  bool syscall_filter = true;

  /** When the judge runs as root, the program is demoted to this uid/gid. */
  unsigned run_uid = 65534;
  unsigned run_gid = 65534;
  /** Fail instead of falling back to an un-namespaced child. */
  bool require_isolation = false;
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
  /** Whether namespaces were actually in effect for this run. */
  bool isolated = false;
  std::string error;
};

/**
 * Runs one program to completion under resource limits.
 *
 * Isolation layers, strongest available first:
 *  - Linux namespaces (mount, pid, net, ipc, uts; plus user when not root):
 *    no network, no view of other processes, masked paths, read-only cwd,
 *    and every stray child dies with the namespace.
 *  - A dedicated unprivileged uid when started as root.
 *  - rlimits for CPU, address space, file size, process count.
 *  - A seccomp-bpf filter that kills on dangerous syscalls.
 *
 * Must be called from a single-threaded process.
 */
RunResult run(const RunSpec& spec);

/** Human-readable name of a signal, e.g. "Segmentation fault". */
std::string signal_name(int signal);

}  // namespace judge::sandbox
