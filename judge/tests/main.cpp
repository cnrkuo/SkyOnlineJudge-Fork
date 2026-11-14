// Test runner for the judge (doctest). The sandbox and runner tests need
// nsjail on PATH, or NSJAIL=/path/to/nsjail.

#define DOCTEST_CONFIG_IMPLEMENT
#include <doctest.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>

#include <unistd.h>

#include "cgroup.hpp"
#include "sandbox.hpp"
#include "support.hpp"

namespace fs = std::filesystem;

namespace {

fs::path g_scratch_root;
judge::sandbox::Settings g_settings;

}  // namespace

namespace judge::testing {

const sandbox::Settings& sandbox_settings() {
  return g_settings;
}

fs::path fresh_dir(const std::string& name) {
  const fs::path dir = g_scratch_root / name;
  fs::remove_all(dir);
  fs::create_directories(dir);
  fs::permissions(dir, fs::perms::all);
  return dir;
}

void write_file(const fs::path& path, const std::string& content) {
  std::ofstream(path, std::ios::binary | std::ios::trunc) << content;
}

}  // namespace judge::testing

int main(int argc, char** argv) {
  // The sandbox uses this binary as the init process inside each jail.
  if (argc >= 2 && std::strcmp(argv[1], judge::sandbox::kInitFlag) == 0) return judge::sandbox::init_main(argc, argv);

  std::string pattern = "/var/tmp/skyoj-judge-test-XXXXXX";
  if (::mkdtemp(pattern.data()) == nullptr) {
    std::perror("mkdtemp");
    return 1;
  }
  g_scratch_root = pattern;
  fs::permissions(g_scratch_root, fs::perms::owner_all | fs::perms::group_exec | fs::perms::others_exec);

  const char* nsjail = std::getenv("NSJAIL");
  g_settings.nsjail = nsjail != nullptr ? nsjail : "nsjail";
  g_settings.init = fs::canonical("/proc/self/exe").string();
  // As root, the tests run with a memory cgroup like the judge does
  // (SKYOJ_TEST_CGROUP=0 turns it off); as another user, without.
  const char* use_cgroup = std::getenv("SKYOJ_TEST_CGROUP");
  if (use_cgroup == nullptr || std::strcmp(use_cgroup, "0") != 0) {
    const auto prepared =
        judge::cgroup::prepare_memory_cgroup("/sys/fs/cgroup", judge::cgroup::default_instance_name());
    g_settings.memory_cgroup = prepared.cgroup;
    std::printf("[judge tests] memory: %s\n", prepared.cgroup
                                                  ? ("cgroup v" + std::to_string(prepared.cgroup->version)).c_str()
                                                  : ("rlimits only (" + prepared.unavailable + ")").c_str());
  }
  judge::sandbox::configure(g_settings);

  doctest::Context context(argc, argv);
  const int status = context.run();
  if (g_settings.memory_cgroup) judge::cgroup::release(*g_settings.memory_cgroup);
  std::error_code ignored;
  fs::remove_all(g_scratch_root, ignored);
  return status;
}
