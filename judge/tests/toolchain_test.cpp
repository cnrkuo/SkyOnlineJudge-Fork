#include <doctest.h>

#include <vector>

#include "common.hpp"
#include "sandbox.hpp"
#include "support.hpp"

namespace fs = std::filesystem;
using judge::sandbox::RunSpec;
using judge::sandbox::Status;

namespace {

constexpr const char* kCpp23Program = R"(#include <expected>
#include <iostream>
#include <ranges>
std::expected<int, const char*> half(int n) {
  if (n % 2) return std::unexpected("odd");
  return n / 2;
}
int main() {
  auto squares = std::views::iota(1, 5) | std::views::transform([](int x) { return x * x; });
  for (int s : squares) std::cout << s << ' ';
  std::cout << half(8).value_or(-1) << ' ' << half(7).error() << ' ';
#ifdef _LIBCPP_VERSION
  std::cout << "libc++\n";
#else
  std::cout << "libstdc++\n";
#endif
}
)";

/** Compiles kCpp23Program with `compiler` in the jail, as the judge does, and returns its output. */
std::string compile_and_run(const std::string& name, std::vector<std::string> compiler) {
  const fs::path dir = judge::testing::fresh_dir(name);
  const fs::path box = dir / "box";
  fs::create_directories(box);
  fs::permissions(box, fs::perms::all);
  judge::testing::write_file(box / "main.cpp", kCpp23Program);
  const std::string out = (dir / "out").string();

  RunSpec compile;
  compile.argv = std::move(compiler);
  for (const char* arg : {"-O2", "-o", "main", "main.cpp"}) compile.argv.emplace_back(arg);
  compile.env = {"PATH=/usr/bin:/bin", "HOME=/tmp"};
  compile.cwd = box.string();
  compile.stdout_path = compile.stderr_path = out;
  compile.single_cpu = false;
  compile.limits = {.cpu_ms = 30000,
                    .wall_ms = 60000,
                    .memory_kb = 2097152,
                    .output_kb = 65536,
                    .max_processes = 256,
                    .tmp_kb = 524288};
  const auto built = judge::sandbox::run(compile);
  INFO(judge::read_file(out).value_or(""), built.error);
  REQUIRE(built.status == Status::Exited);
  REQUIRE(built.exit_code == 0);

  RunSpec program;
  program.argv = {"./main"};
  program.cwd = box.string();
  program.stdout_path = out;
  program.readonly_cwd = true;
  REQUIRE(judge::sandbox::run(program).status == Status::Exited);
  return judge::read_file(out).value_or("");
}

}  // namespace

TEST_CASE("g++ compiles C++23 with libstdc++ inside the sandbox") {
  CHECK(compile_and_run("gcc-cpp23", {"/usr/bin/g++", "-std=c++23"}) == "1 4 9 16 4 odd libstdc++\n");
}

TEST_CASE("clang++ compiles C++23 with libc++ inside the sandbox") {
  if (!fs::exists("/usr/bin/clang++") || !fs::exists("/usr/lib/x86_64-linux-gnu/libc++.so")) {
    MESSAGE("skipped: clang++ or libc++ is not installed");
    return;
  }
  CHECK(compile_and_run("clang-cpp23", {"/usr/bin/clang++", "-std=c++23", "-stdlib=libc++"}) ==
        "1 4 9 16 4 odd libc++\n");
}
