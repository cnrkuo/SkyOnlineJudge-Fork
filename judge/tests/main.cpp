// Test runner for the judge (doctest). The sandbox and runner tests need
// nsjail on PATH, or NSJAIL=/path/to/nsjail.

#define DOCTEST_CONFIG_IMPLEMENT
#include <doctest.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>

#include <unistd.h>

#include "sandbox.hpp"
#include "support.hpp"

namespace fs = std::filesystem;

namespace {

fs::path g_scratch_root;

}  // namespace

namespace judge::testing {

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
  judge::sandbox::configure({
      .nsjail = nsjail != nullptr ? nsjail : "nsjail",
      .init = fs::canonical("/proc/self/exe").string(),
  });

  doctest::Context context(argc, argv);
  const int status = context.run();
  std::error_code ignored;
  fs::remove_all(g_scratch_root, ignored);
  return status;
}
