#pragma once

#include <optional>
#include <string>

namespace judge::cgroup {

/**
 * A memory cgroup this judge owns. nsjail creates one child cgroup per jail
 * inside it (`NSJAIL.<pid>`), sets its memory limit and removes it when the
 * jail ends.
 */
struct MemoryCgroup {
  /** 1 or 2. */
  int version = 2;
  /** The judge's cgroup directory: `<cgroup fs>/skyoj-judge/<host>-<pid>`. */
  std::string path;
  /** cgroup v1 only: the memory hierarchy's mount and `path` relative to it. */
  std::string v1_mount;
  std::string v1_parent;
  /** Whether swap can be limited too (v1 `memsw`, v2 `memory.swap.max`). */
  bool limits_swap = false;
};

/** A prepared cgroup, or why there is none. */
struct Preparation {
  std::optional<MemoryCgroup> cgroup;
  std::string unavailable;
};

/**
 * Prepares this judge's memory cgroup under the cgroup filesystem at `root`
 * (v1 or v2, whichever is mounted there). Needs root and a writable cgroup
 * filesystem; on cgroup v2 it also enables the memory controller on the way
 * down. `instance` names this judge's directory and must be unique among
 * the judges sharing the host.
 */
Preparation prepare_memory_cgroup(const std::string& root, const std::string& instance);

/** A name for `instance` that is unique on this host: `<hostname>-<pid>`. */
std::string default_instance_name();

/**
 * Removes the per-jail cgroups (`NSJAIL.*`) nsjail left behind, which
 * happens only when it was killed. Waits briefly for the jail's processes
 * to finish exiting; failures are ignored.
 */
void remove_jail_cgroups(const MemoryCgroup& cgroup);

/** Removes the judge's cgroup directory, with any jail cgroups left in it; failures are ignored. */
void release(const MemoryCgroup& cgroup);

}  // namespace judge::cgroup
