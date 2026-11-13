#include "sandbox.hpp"

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <string_view>

#include <fcntl.h>
#include <poll.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>
#include <csignal>

#include "common.hpp"

namespace judge::sandbox {
namespace {

namespace fs = std::filesystem;
using Clock = std::chrono::steady_clock;

Settings g_settings;

/** Where things appear inside the jail. */
constexpr const char* kBox = "/box";
constexpr const char* kInitPath = "/.skyoj-init";
/** File descriptor number the init's report arrives on, inside and outside the jail. */
constexpr int kStatusFd = 3;
/** nsjail logs to this descriptor; the judge reads it only when something failed. */
constexpr int kLogFd = 4;
/** How nsjail reports a jail it had to kill (shell convention: 128 + signal). */
constexpr int kKilledStatus = 128 + SIGKILL;
/** Inside uid/gid when the judge is not root (any id works; only one can be mapped). */
constexpr unsigned kUnprivilegedId = 1000;

/** What the init writes to `kStatusFd` once the program has ended. */
struct ExitReport {
  int status;
  struct rusage usage;
};

/**
 * Seccomp policy in nsjail's Kafel language. A deny-list: namespaces, the
 * user ids and file systems are what keep the program in; this kills on the
 * system calls that have no business in a solution, which is also what the
 * "Restricted Function" verdict reports. (Kafel names syscall 166 `umount`.)
 */
constexpr const char* kSeccompPolicy =
    "POLICY judge {"
    "  KILL_PROCESS {"
    "    ptrace, process_vm_readv, process_vm_writev, mount, umount, pivot_root, chroot, unshare, setns,"
    "    bpf, perf_event_open, userfaultfd, io_uring_setup, kexec_load, init_module, finit_module,"
    "    delete_module, reboot, swapon, swapoff, acct, keyctl, add_key, request_key, open_by_handle_at,"
    "    settimeofday, clock_settime, sethostname, setdomainname,"
    // clone() creating any namespace (CLONE_NEWNS|NEWCGROUP|NEWUTS|NEWIPC|NEWUSER|NEWPID|NEWNET).
    "    clone { (clone_flags & 0x7e020000) != 0 }"
    "  },"
    // Runtimes probe these and cope with failure, so fail softly.
    "  ERRNO(1) { socket, socketpair },"
    // glibc falls back to clone(), whose flags the rule above can inspect.
    "  ERRNO(38) { clone3 }"
    "} USE judge DEFAULT ALLOW";

/**
 * Writes to `fd` from a child process that is about to exit; a failure cannot
 * be reported anywhere, so it is deliberately ignored.
 */
void write_best_effort(int fd, const void* data, std::size_t size) {
  [[maybe_unused]] const ssize_t written = ::write(fd, data, size);
}

void write_best_effort(int fd, std::string_view text) {
  write_best_effort(fd, text.data(), text.size());
}

std::string mib(std::int64_t kb) {
  return std::to_string(std::max<std::int64_t>(1, (kb + 1023) / 1024));
}

std::int64_t to_ms(const timeval& tv) {
  return static_cast<std::int64_t>(tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

/** The parts of the host filesystem a program may see, all read-only. */
void add_system_mounts(std::vector<std::string>& args) {
  args.insert(args.end(), {"--bindmount_ro", "/usr"});
  // Merged-/usr systems link /bin, /lib… into /usr; older ones have real directories.
  for (const char* top : {"/bin", "/sbin", "/lib", "/lib32", "/lib64", "/libx32"}) {
    std::error_code error;
    const auto status = fs::symlink_status(top, error);
    if (error) continue;
    if (fs::is_symlink(status)) {
      args.insert(args.end(), {"--symlink", fs::read_symlink(top).string() + ":" + top});
    } else if (fs::is_directory(status)) {
      args.insert(args.end(), {"--bindmount_ro", top});
    }
  }
  // The linker cache, and /etc/alternatives which python3, gcc and g++ resolve through.
  for (const char* path : {"/etc/ld.so.cache", "/etc/alternatives"}) {
    if (fs::exists(path)) args.insert(args.end(), {"--bindmount_ro", path});
  }
  args.insert(args.end(),
              {"--bindmount", "/dev/null", "--bindmount_ro", "/dev/zero", "--bindmount_ro", "/dev/urandom"});
}

std::vector<std::string> nsjail_args(const RunSpec& spec) {
  const Limits& limits = spec.limits;
  const bool root = ::geteuid() == 0;
  const std::string uid = root ? std::to_string(g_settings.run_uid) : std::to_string(kUnprivilegedId);
  const std::string gid = root ? std::to_string(g_settings.run_gid) : std::to_string(kUnprivilegedId);
  const std::string outer_uid = root ? uid : std::to_string(::geteuid());
  const std::string outer_gid = root ? gid : std::to_string(::getegid());

  // Flag/value pairs share a line.
  // clang-format off
  std::vector<std::string> args = {
      g_settings.nsjail, "--mode", "o",
      "--log_fd", std::to_string(kLogFd),
      // nsjail lowers priority by default; judged timings must not depend on it.
      "--nice_level", "0",
      "--hostname", "judge",
      "--user", uid + ":" + outer_uid + ":1",
      "--group", gid + ":" + outer_gid + ":1",
      // nsjail's own defaults (4 GiB, 600 s, 1 MiB files, 32 files) are all replaced.
      // The address-space limit is a loose backstop: runtimes reserve far more than
      // they touch, so the memory verdict comes from peak RSS.
      "--rlimit_as", mib(limits.memory_kb * 2 + 65536),
      "--rlimit_stack", mib(limits.memory_kb),
      // One-second granularity; the exact CPU limit is judged from the usage report.
      "--rlimit_cpu", std::to_string((limits.cpu_ms + 999) / 1000 + 1),
      "--rlimit_fsize", mib(limits.output_kb),
      "--rlimit_nofile", "256",
      "--rlimit_nproc", std::to_string(limits.max_processes),
      "--rlimit_core", "0",
      // Backstop only: the judge kills the jail itself at the exact wall-clock limit.
      "--time_limit", std::to_string((limits.wall_ms + 999) / 1000 + 1),
      "--pass_fd", std::to_string(kStatusFd),
  };
  // clang-format on
  if (spec.single_cpu) args.insert(args.end(), {"--max_cpus", "1"});
  if (spec.syscall_filter) args.insert(args.end(), {"--seccomp_string", kSeccompPolicy});

  add_system_mounts(args);
  args.insert(args.end(), {"--mount", "none:/tmp:tmpfs:size=" + std::to_string(limits.tmp_kb * 1024)});
  args.insert(args.end(), {spec.readonly_cwd ? "--bindmount_ro" : "--bindmount", spec.cwd + ":" + kBox, "--cwd", kBox});
  args.insert(args.end(), {"--bindmount_ro", g_settings.init + ":" + kInitPath});
  for (const auto& variable : spec.env) args.insert(args.end(), {"--env", variable});

  args.insert(args.end(), {"--", kInitPath, kInitFlag, std::to_string(kStatusFd)});
  args.insert(args.end(), spec.argv.begin(), spec.argv.end());
  return args;
}

/** Child side of fork(): wire up descriptors and exec nsjail. Never returns. */
[[noreturn]] void exec_nsjail(const RunSpec& spec, std::vector<std::string>& args, int status_fd, int log_fd) {
  // If the judge dies, nsjail dies, and with it the whole jail.
  ::prctl(PR_SET_PDEATHSIG, SIGKILL);
  const auto open_or_null = [](const std::string& path, int flags) {
    return ::open(path.empty() ? "/dev/null" : path.c_str(), flags | O_CLOEXEC, 0600);
  };
  const int in = open_or_null(spec.stdin_path, O_RDONLY);
  const int out = open_or_null(spec.stdout_path, O_WRONLY | O_CREAT | O_TRUNC);
  // stdout and stderr to one file share a file description, so they interleave.
  const int err = !spec.stderr_path.empty() && spec.stderr_path == spec.stdout_path
                      ? ::dup(out)
                      : open_or_null(spec.stderr_path, O_WRONLY | O_CREAT | O_TRUNC);
  if (in < 0 || out < 0 || err < 0) {
    write_best_effort(log_fd, "cannot open the standard streams\n");
    ::_exit(kExitSetupFailed);
  }
  // Lift the pipes clear of 0–4 first, so no dup2 below overwrites a source.
  status_fd = ::fcntl(status_fd, F_DUPFD_CLOEXEC, 10);
  log_fd = ::fcntl(log_fd, F_DUPFD_CLOEXEC, 10);
  if (status_fd < 0 || log_fd < 0 || ::dup2(in, 0) < 0 || ::dup2(out, 1) < 0 || ::dup2(err, 2) < 0 ||
      ::dup2(status_fd, kStatusFd) < 0 || ::dup2(log_fd, kLogFd) < 0) {
    ::_exit(kExitSetupFailed);
  }
  std::vector<char*> argv;
  argv.reserve(args.size());
  for (auto& arg : args) argv.push_back(arg.data());
  argv.push_back(nullptr);
  // nsjail clears the environment for the jail; only PATH matters here, to find nsjail.
  ::execvp(argv[0], argv.data());
  const std::string message = "cannot execute " + args[0] + ": " + std::strerror(errno) + "\n";
  write_best_effort(kLogFd, message);
  ::_exit(kExitCannotExecute);
}

/** Waits up to `timeout_ms` for `pid`; true when it exited. */
bool wait_for_exit(pid_t pid, std::int64_t timeout_ms, int& status) {
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  const int pidfd = static_cast<int>(::syscall(SYS_pidfd_open, pid, 0));
  bool exited = false;
  for (;;) {
    const pid_t done = ::waitpid(pid, &status, WNOHANG);
    if (done == pid) {
      exited = true;
      break;
    }
    if (done < 0 && errno != EINTR) break;
    const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
    if (left <= 0) break;
    if (pidfd >= 0) {
      struct pollfd pfd {
        pidfd, POLLIN, 0
      };
      ::poll(&pfd, 1, static_cast<int>(std::min<long long>(left, 1000)));
    } else {
      ::usleep(1000);
    }
  }
  if (pidfd >= 0) ::close(pidfd);
  return exited;
}

std::string read_all(int fd) {
  std::string data;
  char buffer[4096];
  for (ssize_t n; (n = ::read(fd, buffer, sizeof buffer)) > 0;) data.append(buffer, static_cast<std::size_t>(n));
  return data;
}

/** The error lines of nsjail's log ("[E]" / "[F]"), or its tail. */
std::string summarize_log(const std::string& log) {
  std::string errors;
  std::size_t start = 0;
  while (start < log.size()) {
    const std::size_t end = std::min(log.find('\n', start), log.size());
    const std::string line = log.substr(start, end - start);
    if (line.starts_with("[E]") || line.starts_with("[F]") || line.find("cannot") != std::string::npos) {
      errors += line + "\n";
    }
    start = end + 1;
  }
  if (errors.empty()) errors = log.size() > 600 ? log.substr(log.size() - 600) : log;
  while (!errors.empty() && errors.back() == '\n') errors.pop_back();
  return errors.empty() ? "nsjail failed without a message" : errors;
}

}  // namespace

void configure(const Settings& settings) {
  g_settings = settings;
}

RunResult run(const RunSpec& spec) {
  RunResult result;
  if (spec.argv.empty()) {
    result.error = "empty argv";
    return result;
  }
  if (g_settings.init.empty()) {
    result.error = "sandbox::configure() was not called";
    return result;
  }

  int status_pipe[2];
  int log_pipe[2];
  if (::pipe2(status_pipe, O_CLOEXEC) != 0) {
    result.error = std::string("pipe2: ") + std::strerror(errno);
    return result;
  }
  if (::pipe2(log_pipe, O_CLOEXEC) != 0) {
    result.error = std::string("pipe2: ") + std::strerror(errno);
    ::close(status_pipe[0]);
    ::close(status_pipe[1]);
    return result;
  }
  // nsjail's log is a few dozen lines, far below the pipe's capacity, so it is
  // read after the run instead of concurrently.
  std::vector<std::string> args = nsjail_args(spec);

  const auto started = Clock::now();
  const pid_t pid = ::fork();
  if (pid < 0) {
    result.error = std::string("fork: ") + std::strerror(errno);
    for (const int fd : {status_pipe[0], status_pipe[1], log_pipe[0], log_pipe[1]}) ::close(fd);
    return result;
  }
  if (pid == 0) exec_nsjail(spec, args, status_pipe[1], log_pipe[1]);
  ::close(status_pipe[1]);
  ::close(log_pipe[1]);

  int status = 0;
  const bool timed_out = !wait_for_exit(pid, spec.limits.wall_ms, status);
  if (timed_out) {
    // Killing nsjail takes the jail with it (its children die with the PID namespace).
    ::kill(pid, SIGKILL);
    while (::waitpid(pid, &status, 0) < 0 && errno == EINTR) {
    }
  }
  result.wall_ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - started).count();

  ExitReport report{};
  const bool reported = ::read(status_pipe[0], &report, sizeof report) == static_cast<ssize_t>(sizeof report);
  ::close(status_pipe[0]);
  const std::string log = read_all(log_pipe[0]);
  ::close(log_pipe[0]);

  if (!reported) {
    // The program never finished under the init: either the jail was killed
    // at the wall-clock limit, or it could not be set up at all.
    if (timed_out || (WIFEXITED(status) && WEXITSTATUS(status) == kKilledStatus) ||
        log.find("time limit") != std::string::npos) {
      result.status = Status::TimeLimit;
      result.cpu_ms = spec.limits.cpu_ms;
      return result;
    }
    result.status = Status::InternalError;
    result.error = summarize_log(log);
    return result;
  }

  result.cpu_ms = to_ms(report.usage.ru_utime) + to_ms(report.usage.ru_stime);
  result.memory_kb = report.usage.ru_maxrss;
  if (WIFEXITED(report.status)) result.exit_code = WEXITSTATUS(report.status);
  if (WIFSIGNALED(report.status)) result.signal = WTERMSIG(report.status);

  if (timed_out || result.cpu_ms > spec.limits.cpu_ms || result.signal == SIGXCPU) {
    result.status = Status::TimeLimit;
  } else if (result.memory_kb > spec.limits.memory_kb) {
    result.status = Status::MemoryLimit;
  } else if (result.signal == SIGXFSZ) {
    result.status = Status::OutputLimit;
  } else if (result.signal == SIGSYS) {
    result.status = Status::Restricted;
  } else if (WIFSIGNALED(report.status)) {
    // SIGKILL here is the hard RLIMIT_CPU limit when it came in just under the
    // measured limit; anything else is a crash.
    result.status =
        result.signal == SIGKILL && result.cpu_ms + 1000 >= spec.limits.cpu_ms ? Status::TimeLimit : Status::Signaled;
  } else {
    result.status = Status::Exited;
  }
  return result;
}

int init_main(int argc, char** argv) {
  // <exe> --sandbox-init <fd> <program> [args…]
  if (argc < 4) return kExitInitFailed;
  const int report_fd = std::atoi(argv[2]);
  ::fcntl(report_fd, F_SETFD, FD_CLOEXEC);

  const pid_t child = ::fork();
  if (child < 0) return kExitInitFailed;
  if (child == 0) {
    ::execvp(argv[3], argv + 3);
    const std::string message = std::string("cannot execute ") + argv[3] + ": " + std::strerror(errno) + "\n";
    write_best_effort(STDERR_FILENO, message);
    ::_exit(kExitCannotExecute);
  }
  // As PID 1 this process also inherits every orphan; only the program's own
  // status matters, and the namespace takes the rest down when it exits.
  ExitReport report{};
  while (::wait4(child, &report.status, 0, &report.usage) < 0) {
    if (errno != EINTR) return kExitInitFailed;
  }
  write_best_effort(report_fd, &report, sizeof report);
  return 0;
}

std::string signal_name(int signal) {
  const char* name = ::strsignal(signal);
  return name ? name : "Unknown signal";
}

}  // namespace judge::sandbox
