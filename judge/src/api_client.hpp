#pragma once

#include <cstdint>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

#include "common.hpp"

namespace httplib {
class Client;
}

namespace judge {

struct Testcase {
  int id = 0;
  int ordinal = 0;
  std::string input_sha256;
  std::string output_sha256;
};

/** One submission to judge, as handed out by `POST /judge/fetch`. */
struct Task {
  int submission_id = 0;
  int problem_id = 0;
  std::string language;
  std::string code;
  std::int64_t time_limit_ms = 0;
  std::int64_t memory_limit_kb = 0;
  std::vector<Testcase> testcases;
};

struct TestResult {
  int testcase_id = 0;
  Verdict verdict = Verdict::JudgeError;
  std::int64_t time_ms = 0;
  std::int64_t memory_kb = 0;
  double score = 0.0;
  std::string message;
};

/** Sent back with `POST /judge/report`. */
struct Report {
  int submission_id = 0;
  /** Set when the run never reached the testcases (compile/judge error). */
  std::optional<Verdict> verdict;
  std::string compile_message;
  std::vector<TestResult> results;
};

class ApiError : public std::runtime_error {
  using std::runtime_error::runtime_error;
};

/**
 * Client for the `judge.*` procedures of the API contract
 * (packages/contract/src/contract.ts). All calls are JSON POSTs
 * authenticated with the judge's bearer token and throw ApiError on failure.
 */
class ApiClient {
 public:
  ApiClient(const std::string& base_url, const std::string& token);
  ~ApiClient();

  /** Claims the next queued submission in one of `languages`, if any. */
  std::optional<Task> fetch(const std::vector<std::string>& languages);
  /** Downloads one testcase file ("input" or "output") to `destination`. */
  void download_testdata(int testcase_id, const std::string& kind, const std::string& destination);
  void report(const Report& report);

 private:
  std::string post(const std::string& procedure, const std::string& body);

  std::unique_ptr<httplib::Client> http_;
  std::string base_path_;
};

}  // namespace judge
