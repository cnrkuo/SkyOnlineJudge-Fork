#include "cgroup.hpp"

#include <array>
#include <cctype>
#include <cerrno>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <thread>

#include <linux/magic.h>
#include <sys/statfs.h>
#include <unistd.h>

#include "common.hpp"

namespace judge::cgroup {
namespace {

namespace fs = std::filesystem;

/** Directory under the cgroup root that holds every judge on the host. */
constexpr const char* kJudgesDir = "skyoj-judge";
/** Removing a jail's cgroup is retried this often, this far apart, while its processes exit. */
constexpr int kRemoveAttempts = 50;
constexpr int kRemoveRetryMs = 20;
/** cgroup v2: where the judge moves itself when its own cgroup must stay empty. */
constexpr const char* kDaemonDir = "daemon";

bool contains_word(const std::string& text, const std::string& word) {
  std::size_t at = text.find(word);
  while (at != std::string::npos) {
    const bool starts = at == 0 || text[at - 1] == ' ';
    const std::size_t end = at + word.size();
    const bool ends = end == text.size() || text[end] == ' ' || text[end] == '\n';
    if (starts && ends) return true;
    at = text.find(word, at + 1);
  }
  return false;
}

/** Writes `value` to a cgroup control file; returns errno, or 0 on success. */
int write_control(const fs::path& file, const std::string& value) {
  std::ofstream out(file);
  if (!out) return errno != 0 ? errno : EACCES;
  out << value;
  out.flush();
  return out ? 0 : (errno != 0 ? errno : EIO);
}

/** Why a directory could not be created, in words an operator can act on. */
std::string cannot_create(const fs::path& dir, const std::error_code& error) {
  if (error.value() == EROFS) {
    return "the cgroup filesystem is read-only (in Docker, mount /sys/fs/cgroup read-write; see docs/deployment.md)";
  }
  return "cannot create " + dir.string() + ": " + error.message();
}

/**
 * cgroup v2 allows a controller in a cgroup only if its parent enables it
 * for its children, and a cgroup that enables controllers for its children
 * may not contain processes itself ("no internal processes"). When the
 * parent is the judge's own cgroup (a container's namespaced root), the
 * judge first moves itself into a child.
 */
std::string enable_memory_for_children(const fs::path& parent) {
  const auto enabled = read_file((parent / "cgroup.subtree_control").string());
  if (enabled && contains_word(*enabled, "memory")) return {};
  int error = write_control(parent / "cgroup.subtree_control", "+memory");
  if (error == EBUSY) {
    std::error_code ignored;
    fs::create_directory(parent / kDaemonDir, ignored);
    if (write_control(parent / kDaemonDir / "cgroup.procs", std::to_string(::getpid())) == 0) {
      error = write_control(parent / "cgroup.subtree_control", "+memory");
    }
  }
  if (error == 0) return {};
  return "cannot enable the memory controller in " + parent.string() + ": " + std::strerror(error);
}

Preparation prepare_v2(const fs::path& root, const std::string& instance) {
  const auto controllers = read_file((root / "cgroup.controllers").string());
  if (!controllers || !contains_word(*controllers, "memory")) {
    return {std::nullopt, "the memory controller is not available in " + root.string()};
  }
  const fs::path judges = root / kJudgesDir;
  const fs::path path = judges / instance;
  for (const auto& [parent, child] : {std::pair{root, judges}, std::pair{judges, path}}) {
    std::error_code error;
    fs::create_directory(child, error);
    if (error) return {std::nullopt, cannot_create(child, error)};
    if (const std::string problem = enable_memory_for_children(parent); !problem.empty()) {
      return {std::nullopt, problem};
    }
  }
  // Each jail's own cgroup is created below `path`.
  if (const std::string problem = enable_memory_for_children(path); !problem.empty()) return {std::nullopt, problem};
  MemoryCgroup cgroup;
  cgroup.version = 2;
  cgroup.path = path.string();
  cgroup.limits_swap = fs::exists(path / "memory.swap.max");
  return {cgroup, {}};
}

Preparation prepare_v1(const fs::path& root, const std::string& instance) {
  const fs::path mount = root / "memory";
  if (!fs::exists(mount / "memory.limit_in_bytes")) {
    return {std::nullopt, "no cgroup v1 memory hierarchy at " + mount.string()};
  }
  const std::string parent = std::string(kJudgesDir) + "/" + instance;
  const fs::path path = mount / parent;
  std::error_code error;
  fs::create_directories(path, error);
  if (error) return {std::nullopt, cannot_create(path, error)};
  MemoryCgroup cgroup{.version = 1, .path = path.string(), .v1_mount = mount.string(), .v1_parent = parent};
  cgroup.limits_swap = fs::exists(path / "memory.memsw.limit_in_bytes");
  return {cgroup, {}};
}

}  // namespace

Preparation prepare_memory_cgroup(const std::string& root, const std::string& instance) {
  if (::geteuid() != 0) return {std::nullopt, "the judge does not run as root"};
  struct statfs info {};
  if (::statfs(root.c_str(), &info) != 0) return {std::nullopt, "no cgroup filesystem at " + root};
  return info.f_type == CGROUP2_SUPER_MAGIC ? prepare_v2(root, instance) : prepare_v1(root, instance);
}

std::string default_instance_name() {
  std::array<char, 256> host{};
  std::string name = ::gethostname(host.data(), host.size() - 1) == 0 ? host.data() : "judge";
  for (char& c : name) {
    if (std::isalnum(static_cast<unsigned char>(c)) == 0 && c != '-' && c != '.') c = '_';
  }
  return name + "-" + std::to_string(::getpid());
}

void remove_jail_cgroups(const MemoryCgroup& cgroup) {
  std::error_code error;
  for (const auto& entry : fs::directory_iterator(cgroup.path, error)) {
    if (!entry.is_directory() || !entry.path().filename().string().starts_with("NSJAIL.")) continue;
    // rmdir fails with EBUSY until the last of the jail's processes is gone.
    for (int attempt = 0; attempt < kRemoveAttempts && ::rmdir(entry.path().c_str()) != 0 && errno == EBUSY;
         ++attempt) {
      std::this_thread::sleep_for(std::chrono::milliseconds(kRemoveRetryMs));
    }
  }
}

void release(const MemoryCgroup& cgroup) {
  remove_jail_cgroups(cgroup);
  ::rmdir(cgroup.path.c_str());
}

}  // namespace judge::cgroup
