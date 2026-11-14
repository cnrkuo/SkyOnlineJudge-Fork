#include <doctest.h>

#include "api_client.hpp"
#include "config.hpp"
#include "runner.hpp"
#include "support.hpp"

namespace fs = std::filesystem;
using judge::Report;
using judge::Task;
using judge::Verdict;

namespace {

/**
 * A runner whose testdata is already in the cache, so it never needs the
 * API: the client points at a port nothing listens on.
 */
struct Bench {
  judge::Config config;
  judge::ApiClient api{"http://127.0.0.1:9", "unused"};
  judge::Runner runner{config, api};
  int next_hash = 0;

  explicit Bench(const std::string& name) {
    const fs::path root = judge::testing::fresh_dir(name);
    config.languages = judge::default_languages();
    config.work_dir = (root / "work").string();
    config.cache_dir = (root / "cache").string();
    fs::create_directories(config.work_dir);
    fs::create_directories(config.cache_dir);
    fs::permissions(config.work_dir, fs::perms::owner_all | fs::perms::group_exec | fs::perms::others_exec);
  }

  /** Puts `content` into the cache under a made-up content hash and returns that hash. */
  std::string cached(const std::string& content) {
    const std::string hash = judge::format("%064x", ++next_hash);
    judge::testing::write_file(fs::path(config.cache_dir) / hash, content);
    return hash;
  }

  Task task(const std::string& language, const std::string& code,
            const std::vector<std::pair<std::string, std::string>>& cases) {
    Task task{.submission_id = 1,
              .problem_id = 1,
              .language = language,
              .code = code,
              .time_limit_ms = 1000,
              .memory_limit_kb = 262144,
              .testcases = {}};
    for (const auto& [input, output] : cases) {
      task.testcases.push_back({.id = static_cast<int>(task.testcases.size()) + 1,
                                .ordinal = static_cast<int>(task.testcases.size()),
                                .input_sha256 = cached(input),
                                .output_sha256 = cached(output)});
    }
    return task;
  }
};

const std::vector<std::pair<std::string, std::string>> kSums = {{"1 2\n", "3\n"}, {"5 -5\n", "0\n"}};

}  // namespace

TEST_CASE("the runner judges every testcase of a correct solution as accepted") {
  Bench bench("runner-ac");
  const Report report = bench.runner.judge(bench.task("py3", "print(sum(map(int, input().split())))", kSums));
  CHECK_FALSE(report.verdict.has_value());
  REQUIRE(report.results.size() == 2);
  for (const auto& result : report.results) {
    CHECK(result.verdict == Verdict::Accepted);
    CHECK(result.score == 1.0);
  }
  CHECK(report.results[1].testcase_id == 2);
}

TEST_CASE("the runner gives each testcase its own verdict") {
  Bench bench("runner-mixed");
  // Right on the first testcase only.
  const Report report = bench.runner.judge(bench.task("py3", "print(3)", kSums));
  REQUIRE(report.results.size() == 2);
  CHECK(report.results[0].verdict == Verdict::Accepted);
  CHECK(report.results[1].verdict == Verdict::WrongAnswer);
  CHECK(report.results[1].message == "Line 1 differs");
}

TEST_CASE("the runner turns runtime failures into verdicts") {
  Bench bench("runner-failures");
  const Report crashed = bench.runner.judge(bench.task("py3", "raise SystemExit(3)", {{"", ""}}));
  CHECK(crashed.results.at(0).verdict == Verdict::RuntimeError);

  const Report slow = bench.runner.judge(bench.task("py3", "while True: pass", {{"", ""}}));
  CHECK(slow.results.at(0).verdict == Verdict::TimeLimitExceeded);
  CHECK(slow.results.at(0).time_ms == 1000);  // capped at the limit
}

TEST_CASE("the runner reports compile errors with the compiler's message") {
  Bench bench("runner-ce");
  const Report report = bench.runner.judge(bench.task("c", "int main(void) { return undefined_name; }", kSums));
  CHECK(report.verdict == Verdict::CompileError);
  CHECK(report.compile_message.find("undefined_name") != std::string::npos);
  CHECK(report.results.empty());
}

TEST_CASE("the runner refuses languages this judge does not have") {
  Bench bench("runner-language");
  const Report report = bench.runner.judge(bench.task("cobol", "DISPLAY 'HI'.", kSums));
  CHECK(report.verdict == Verdict::JudgeError);
  CHECK(report.compile_message.find("cobol") != std::string::npos);
}

TEST_CASE("the runner only trusts content hashes as cache file names") {
  Bench bench("runner-hash");
  Task task = bench.task("py3", "print(3)", kSums);
  task.testcases[0].input_sha256 = "../../etc/passwd";
  CHECK_THROWS_AS(bench.runner.judge(task), judge::ApiError);
}

TEST_CASE("the toolchain check finds working and broken languages") {
  Bench bench("runner-toolchain");
  CHECK_FALSE(bench.runner.check_toolchain("py3").has_value());
  CHECK_FALSE(bench.runner.check_toolchain("c").has_value());
  CHECK(bench.runner.check_toolchain("cobol") == "not configured");

  bench.config.languages["broken"] = {
      "main.cpp", {"/usr/bin/g++", "-nostdinc++", "-o", "main", "main.cpp"}, {"./main"}};
  const auto problem = bench.runner.check_toolchain("broken");
  CHECK(problem.value_or("").find("iostream") != std::string::npos);
}
