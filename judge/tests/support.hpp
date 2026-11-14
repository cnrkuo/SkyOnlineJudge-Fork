#pragma once

#include <filesystem>
#include <string>

#include "sandbox.hpp"

namespace judge::testing {

/**
 * A fresh, empty directory for one test. It lives under a scratch root that
 * every uid can traverse (nsjail mounts it from inside a user namespace) and
 * is world-writable, because sandboxed programs run as another uid. The
 * whole root is removed when the test run ends.
 */
std::filesystem::path fresh_dir(const std::string& name);

/** Writes `content` to `path`, creating or truncating it. */
void write_file(const std::filesystem::path& path, const std::string& content);

/** The sandbox settings the test run started with (with a memory cgroup when root). */
const sandbox::Settings& sandbox_settings();

/** Runs a test with other sandbox settings, restoring the originals afterwards. */
class ScopedSandbox {
 public:
  explicit ScopedSandbox(const sandbox::Settings& settings) { sandbox::configure(settings); }
  ScopedSandbox(const ScopedSandbox&) = delete;
  ScopedSandbox& operator=(const ScopedSandbox&) = delete;
  ~ScopedSandbox() { sandbox::configure(sandbox_settings()); }
};

}  // namespace judge::testing
