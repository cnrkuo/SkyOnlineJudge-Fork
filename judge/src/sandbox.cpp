#include "sandbox.hpp"

#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstddef>
#include <cstring>

#include <fcntl.h>
#include <grp.h>
#include <linux/audit.h>
#include <linux/filter.h>
#include <linux/seccomp.h>
#include <poll.h>
#include <sched.h>
#include <signal.h>
#include <sys/mount.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <sys/statvfs.h>
#include <sys/syscall.h>
#include <sys/wait.h>
#include <unistd.h>

#if defined(__x86_64__)
#define JUDGE_AUDIT_ARCH AUDIT_ARCH_X86_64
#elif defined(__aarch64__)
#define JUDGE_AUDIT_ARCH AUDIT_ARCH_AARCH64
#else
#error "Unsupported architecture: add its AUDIT_ARCH_* constant here"
#endif

namespace judge::sandbox {
namespace {

using Clock = std::chrono::steady_clock;

/** uid/gid the program sees inside a user namespace. Non-zero so that
 *  execve() drops every capability the namespace granted us. */
constexpr unsigned kInnerId = 1000;

// ------------------------------------------------------------------ child side
// Everything below runs between clone() and execve(). The judge is
// single-threaded, so using the allocator here is safe.

/** Reports a setup failure to the parent through the CLOEXEC pipe and dies. */
[[noreturn]] void die(int report_fd, const std::string& what) {
  std::string message = what + ": " + std::strerror(errno);
  (void)!::write(report_fd, message.data(), message.size());
  ::_exit(127);
}

bool write_file(const char* path, const std::string& content) {
  int fd = ::open(path, O_WRONLY | O_CLOEXEC);
  if (fd < 0) return false;
  bool ok = ::write(fd, content.data(), content.size()) == static_cast<ssize_t>(content.size());
  ::close(fd);
  return ok;
}

void redirect(int report_fd, const std::string& path, int target, int flags) {
  const char* file = path.empty() ? "/dev/null" : path.c_str();
  int fd = ::open(file, flags, 0600);
  if (fd < 0) die(report_fd, std::string("open ") + file);
  if (fd != target) {
    if (::dup2(fd, target) < 0) die(report_fd, "dup2");
    ::close(fd);
  }
}

void set_limit(int report_fd, int resource, rlim_t value) {
  struct rlimit limit {value, value};
  if (::setrlimit(resource, &limit) != 0) die(report_fd, "setrlimit");
}

/** Maps our outer uid/gid to `kInnerId` inside the new user namespace. */
void map_ids(int report_fd, uid_t outer_uid, gid_t outer_gid) {
  if (!write_file("/proc/self/setgroups", "deny") && errno != ENOENT) die(report_fd, "write setgroups");
  if (!write_file("/proc/self/uid_map", std::to_string(kInnerId) + " " + std::to_string(outer_uid) + " 1"))
    die(report_fd, "write uid_map");
  if (!write_file("/proc/self/gid_map", std::to_string(kInnerId) + " " + std::to_string(outer_gid) + " 1"))
    die(report_fd, "write gid_map");
}

/** Hides a path: tmpfs over directories, /dev/null over files. */
void mask_path(int report_fd, const std::string& path) {
  struct stat st {};
  if (::stat(path.c_str(), &st) != 0) {
    if (errno == ENOENT) return;
    die(report_fd, "stat " + path);
  }
  int rc = S_ISDIR(st.st_mode)
               ? ::mount("tmpfs", path.c_str(), "tmpfs", MS_NOSUID | MS_NODEV | MS_NOEXEC, "size=4k,mode=000")
               : ::mount("/dev/null", path.c_str(), nullptr, MS_BIND, nullptr);
  if (rc != 0) die(report_fd, "mask " + path);
}

void make_readonly(int report_fd, const std::string& dir) {
  if (::mount(dir.c_str(), dir.c_str(), nullptr, MS_BIND | MS_REC, nullptr) != 0) die(report_fd, "bind " + dir);
  // Inside a user namespace a remount must keep the flags the original
  // mount was locked with, so carry them over.
  unsigned long flags = MS_BIND | MS_REMOUNT | MS_RDONLY | MS_NOSUID | MS_NODEV;
  struct statvfs vfs {};
  if (::statvfs(dir.c_str(), &vfs) == 0) {
    if (vfs.f_flag & ST_NOEXEC) flags |= MS_NOEXEC;
    if (vfs.f_flag & ST_NOATIME) flags |= MS_NOATIME;
    if (vfs.f_flag & ST_NODIRATIME) flags |= MS_NODIRATIME;
    if (vfs.f_flag & ST_RELATIME) flags |= MS_RELATIME;
  }
  if (::mount(nullptr, dir.c_str(), nullptr, flags, nullptr) != 0) die(report_fd, "remount read-only " + dir);
}

void setup_mounts(int report_fd, const RunSpec& spec) {
  // Keep our mounts from propagating back to the host.
  if (::mount(nullptr, "/", nullptr, MS_REC | MS_PRIVATE, nullptr) != 0) die(report_fd, "make / private");
  if (spec.readonly_cwd) make_readonly(report_fd, spec.cwd);
  for (const auto& path : spec.masked_paths) mask_path(report_fd, path);
  // Best effort: a fresh /proc so the program only sees its own pid
  // namespace. Hardened hosts may refuse this; the pid namespace still holds.
  (void)::mount("proc", "/proc", "proc", MS_NOSUID | MS_NODEV | MS_NOEXEC, nullptr);
}

#define JUDGE_KILL_ON(nr) \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, static_cast<__u32>(nr), 0, 1), BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS)
#define JUDGE_ERRNO_ON(nr, err)                                     \
  BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, static_cast<__u32>(nr), 0, 1), \
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ERRNO | ((err) & SECCOMP_RET_DATA))

/**
 * Deny-list syscall filter. Namespaces and the unprivileged uid already make
 * most of these fail; the filter is a second line of defence and is what
 * produces the "Restricted Function" verdict (the process dies with SIGSYS).
 */
void install_syscall_filter(int report_fd) {
  constexpr __u32 kNamespaceFlags =
      CLONE_NEWUSER | CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWIPC | CLONE_NEWUTS | CLONE_NEWCGROUP;
  struct sock_filter filter[] = {
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, arch)),
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, JUDGE_AUDIT_ARCH, 1, 0),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, nr)),
#if defined(__x86_64__)
      // Reject the x32 ABI, whose syscall numbers would dodge the list below.
      BPF_JUMP(BPF_JMP | BPF_JGE | BPF_K, 0x40000000u, 0, 1),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
#endif
      JUDGE_KILL_ON(SYS_ptrace),
      JUDGE_KILL_ON(SYS_process_vm_readv),
      JUDGE_KILL_ON(SYS_process_vm_writev),
      JUDGE_KILL_ON(SYS_mount),
      JUDGE_KILL_ON(SYS_umount2),
      JUDGE_KILL_ON(SYS_pivot_root),
      JUDGE_KILL_ON(SYS_chroot),
      JUDGE_KILL_ON(SYS_unshare),
      JUDGE_KILL_ON(SYS_setns),
      JUDGE_KILL_ON(SYS_bpf),
      JUDGE_KILL_ON(SYS_perf_event_open),
      JUDGE_KILL_ON(SYS_userfaultfd),
      JUDGE_KILL_ON(SYS_io_uring_setup),
      JUDGE_KILL_ON(SYS_kexec_load),
      JUDGE_KILL_ON(SYS_init_module),
      JUDGE_KILL_ON(SYS_finit_module),
      JUDGE_KILL_ON(SYS_delete_module),
      JUDGE_KILL_ON(SYS_reboot),
      JUDGE_KILL_ON(SYS_swapon),
      JUDGE_KILL_ON(SYS_swapoff),
      JUDGE_KILL_ON(SYS_acct),
      JUDGE_KILL_ON(SYS_keyctl),
      JUDGE_KILL_ON(SYS_add_key),
      JUDGE_KILL_ON(SYS_request_key),
      JUDGE_KILL_ON(SYS_open_by_handle_at),
      JUDGE_KILL_ON(SYS_settimeofday),
      JUDGE_KILL_ON(SYS_clock_settime),
      JUDGE_KILL_ON(SYS_sethostname),
      JUDGE_KILL_ON(SYS_setdomainname),
      // Runtimes probe these and cope with failure, so fail softly.
      JUDGE_ERRNO_ON(SYS_socket, EPERM),
      JUDGE_ERRNO_ON(SYS_socketpair, EPERM),
      // glibc falls back to clone() when clone3() is unavailable; clone()'s
      // flags are inspectable, clone3()'s are behind a pointer.
      JUDGE_ERRNO_ON(SYS_clone3, ENOSYS),
      // clone(): allow threads and plain forks, refuse new namespaces.
      BPF_JUMP(BPF_JMP | BPF_JEQ | BPF_K, static_cast<__u32>(SYS_clone), 0, 3),
      BPF_STMT(BPF_LD | BPF_W | BPF_ABS, offsetof(struct seccomp_data, args[0])),
      BPF_JUMP(BPF_JMP | BPF_JSET | BPF_K, kNamespaceFlags, 0, 1),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_KILL_PROCESS),
      BPF_STMT(BPF_RET | BPF_K, SECCOMP_RET_ALLOW),
  };
  struct sock_fprog program {
    static_cast<unsigned short>(sizeof filter / sizeof filter[0]), filter
  };
  if (::prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &program) != 0) die(report_fd, "install seccomp filter");
}

/** What the init shim tells the judge about the program it supervised. */
struct ExitReport {
  int status;
  struct rusage usage;
};

/**
 * PID 1 of a pid namespace ignores signals it has no handler for — including
 * the SIGXFSZ / SIGABRT a submission is supposed to die from. So the program
 * never runs as PID 1: this shim does, and merely waits for it. When the shim
 * exits (or is killed on timeout) the kernel tears down the whole namespace.
 */
[[noreturn]] void init_shim(pid_t program, int status_fd) {
  ExitReport report{};
  while (::wait4(program, &report.status, 0, &report.usage) < 0 && errno == EINTR) {
  }
  (void)!::write(status_fd, &report, sizeof report);
  ::_exit(0);
}

[[noreturn]] void child_main(const RunSpec& spec, int report_fd, int status_fd, bool isolated, bool user_namespace,
                             uid_t outer_uid, gid_t outer_gid) {
  ::prctl(PR_SET_PDEATHSIG, SIGKILL);
  // Without a pid namespace the process group is how the parent reaps strays.
  if (!isolated) ::setpgid(0, 0);

  // Open the I/O files first: afterwards they may be masked or unreadable.
  redirect(report_fd, spec.stdin_path, STDIN_FILENO, O_RDONLY);
  redirect(report_fd, spec.stdout_path, STDOUT_FILENO, O_WRONLY | O_CREAT | O_TRUNC);
  if (!spec.stderr_path.empty() && spec.stderr_path == spec.stdout_path) {
    // Share one file description so the two streams interleave correctly.
    if (::dup2(STDOUT_FILENO, STDERR_FILENO) < 0) die(report_fd, "dup2");
  } else {
    redirect(report_fd, spec.stderr_path, STDERR_FILENO, O_WRONLY | O_CREAT | O_TRUNC);
  }

  if (user_namespace) map_ids(report_fd, outer_uid, outer_gid);
  if (isolated) setup_mounts(report_fd, spec);
  if (::chdir(spec.cwd.c_str()) != 0) die(report_fd, "chdir " + spec.cwd);

  if (isolated) {
    pid_t program = ::fork();
    if (program < 0) die(report_fd, "fork");
    if (program > 0) {
      ::close(report_fd);
      init_shim(program, status_fd);
    }
    ::prctl(PR_SET_PDEATHSIG, SIGKILL);
  }
  ::close(status_fd);

  const Limits& limits = spec.limits;
  const rlim_t memory_bytes = static_cast<rlim_t>(limits.memory_kb) * 1024;
  // RLIMIT_CPU has one-second granularity; the parent applies the exact limit.
  set_limit(report_fd, RLIMIT_CPU, static_cast<rlim_t>((limits.cpu_ms + 999) / 1000 + 1));
  // Address space is a loose backstop (runtimes reserve far more than they
  // touch); the real memory verdict comes from peak RSS.
  set_limit(report_fd, RLIMIT_AS, memory_bytes * 2 + (static_cast<rlim_t>(64) << 20));
  set_limit(report_fd, RLIMIT_STACK, memory_bytes);
  set_limit(report_fd, RLIMIT_FSIZE, static_cast<rlim_t>(limits.output_kb) * 1024);
  set_limit(report_fd, RLIMIT_CORE, 0);
  set_limit(report_fd, RLIMIT_NOFILE, 256);

  if (outer_uid == 0 && !user_namespace && spec.run_uid != 0) {
    if (::setgroups(0, nullptr) != 0) die(report_fd, "setgroups");
    if (::setgid(spec.run_gid) != 0) die(report_fd, "setgid");
    if (::setuid(spec.run_uid) != 0) die(report_fd, "setuid");
    // Counted per real uid, so it only means something for a dedicated one.
    set_limit(report_fd, RLIMIT_NPROC, static_cast<rlim_t>(limits.max_processes));
  }

  if (::prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) die(report_fd, "no_new_privs");
  if (spec.syscall_filter) install_syscall_filter(report_fd);

  std::vector<char*> argv;
  for (const auto& arg : spec.argv) argv.push_back(const_cast<char*>(arg.c_str()));
  argv.push_back(nullptr);
  std::vector<char*> envp;
  for (const auto& var : spec.env) envp.push_back(const_cast<char*>(var.c_str()));
  envp.push_back(nullptr);
  ::execve(argv[0], argv.data(), envp.data());
  die(report_fd, "execve " + spec.argv[0]);
}

// ----------------------------------------------------------------- parent side

/** fork()-like clone that also creates the given namespaces. */
pid_t clone_process(unsigned long namespace_flags) {
  return static_cast<pid_t>(::syscall(SYS_clone, namespace_flags | SIGCHLD, nullptr, nullptr, nullptr, nullptr));
}

std::int64_t to_ms(const timeval& tv) {
  return static_cast<std::int64_t>(tv.tv_sec) * 1000 + tv.tv_usec / 1000;
}

std::int64_t elapsed_ms(Clock::time_point since) {
  return std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - since).count();
}

/** Blocks until the child exits or `timeout_ms` passes; true when it exited. */
bool wait_for_exit(pid_t pid, int pidfd, std::int64_t timeout_ms, int& status, struct rusage& usage) {
  const auto deadline = Clock::now() + std::chrono::milliseconds(timeout_ms);
  for (;;) {
    pid_t done = ::wait4(pid, &status, WNOHANG, &usage);
    if (done == pid) return true;
    if (done < 0 && errno != EINTR) return false;
    const auto left = std::chrono::duration_cast<std::chrono::milliseconds>(deadline - Clock::now()).count();
    if (left <= 0) return false;
    if (pidfd >= 0) {
      struct pollfd pfd {pidfd, POLLIN, 0};
      ::poll(&pfd, 1, static_cast<int>(std::min<long long>(left, 1000)));
    } else {
      ::usleep(1000);
    }
  }
}

}  // namespace

RunResult run(const RunSpec& spec) {
  RunResult result;
  if (spec.argv.empty()) {
    result.error = "empty argv";
    return result;
  }

  // report: setup errors before execve(); status: the init shim's ExitReport.
  int report[2];
  int status_pipe[2];
  if (::pipe2(report, O_CLOEXEC) != 0) {
    result.error = std::string("pipe2: ") + std::strerror(errno);
    return result;
  }
  if (::pipe2(status_pipe, O_CLOEXEC) != 0) {
    result.error = std::string("pipe2: ") + std::strerror(errno);
    ::close(report[0]);
    ::close(report[1]);
    return result;
  }

  const uid_t uid = ::geteuid();
  const gid_t gid = ::getegid();
  const bool user_namespace = uid != 0;
  unsigned long flags = CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWNET | CLONE_NEWIPC | CLONE_NEWUTS;
  if (user_namespace) flags |= CLONE_NEWUSER;

  const auto started = Clock::now();
  bool isolated = true;
  pid_t pid = clone_process(flags);
  if (pid < 0 && !spec.require_isolation) {
    // Namespaces are unavailable (restricted container, old kernel).
    isolated = false;
    pid = clone_process(0);
  }
  if (pid < 0) {
    result.error = std::string("clone: ") + std::strerror(errno);
    for (int fd : {report[0], report[1], status_pipe[0], status_pipe[1]}) ::close(fd);
    return result;
  }
  if (pid == 0) {
    ::close(report[0]);
    ::close(status_pipe[0]);
    child_main(spec, report[1], status_pipe[1], isolated, isolated && user_namespace, uid, gid);
  }
  ::close(report[1]);
  ::close(status_pipe[1]);
  result.isolated = isolated;

  int pidfd = static_cast<int>(::syscall(SYS_pidfd_open, pid, 0));
  int status = 0;
  struct rusage usage {};
  bool timed_out = false;
  if (!wait_for_exit(pid, pidfd, spec.limits.wall_ms, status, usage)) {
    timed_out = true;
    ::kill(pid, SIGKILL);
    while (::wait4(pid, &status, 0, &usage) < 0 && errno == EINTR) {
    }
  }
  if (pidfd >= 0) ::close(pidfd);
  // Sweep anything the program left behind. With a pid namespace the kernel
  // already killed it all when the namespace's init (our child) died.
  if (!isolated) ::kill(-pid, SIGKILL);

  // With namespaces, `pid` was the init shim; the program's own exit status
  // and resource usage arrive through the status pipe.
  ExitReport inner{};
  const bool have_inner = ::read(status_pipe[0], &inner, sizeof inner) == static_cast<ssize_t>(sizeof inner);
  ::close(status_pipe[0]);
  if (have_inner) {
    status = inner.status;
    usage = inner.usage;
  }

  result.wall_ms = elapsed_ms(started);
  result.cpu_ms = to_ms(usage.ru_utime) + to_ms(usage.ru_stime);
  result.memory_kb = usage.ru_maxrss;

  // Anything on the pipe means setup failed before execve().
  char buffer[512];
  ssize_t length = ::read(report[0], buffer, sizeof buffer);
  ::close(report[0]);
  if (length > 0) {
    result.status = Status::InternalError;
    result.error.assign(buffer, static_cast<std::size_t>(length));
    return result;
  }

  if (isolated && !have_inner && !timed_out) {
    result.status = Status::InternalError;
    result.error = "the sandbox supervisor died unexpectedly";
    return result;
  }

  if (WIFEXITED(status)) result.exit_code = WEXITSTATUS(status);
  if (WIFSIGNALED(status)) result.signal = WTERMSIG(status);

  if (timed_out || result.cpu_ms > spec.limits.cpu_ms || result.signal == SIGXCPU) {
    result.status = Status::TimeLimit;
  } else if (result.memory_kb > spec.limits.memory_kb) {
    result.status = Status::MemoryLimit;
  } else if (result.signal == SIGXFSZ) {
    result.status = Status::OutputLimit;
  } else if (result.signal == SIGSYS) {
    result.status = Status::Restricted;
  } else if (WIFSIGNALED(status)) {
    result.status = Status::Signaled;
  } else {
    result.status = Status::Exited;
  }
  return result;
}

std::string signal_name(int signal) {
  const char* name = ::strsignal(signal);
  return name ? name : "Unknown signal";
}

}  // namespace judge::sandbox
