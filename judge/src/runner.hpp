#pragma once

#include <filesystem>
#include <optional>
#include <string>

#include "api_client.hpp"
#include "config.hpp"
#include "sandbox.hpp"

namespace judge {

/**
 * Judges one task: materialises the source, compiles it, runs it against
 * every testcase inside the sandbox and checks the output.
 *
 * Task layout under `work_dir`:
 *   <task>/box/   source and binary; the program's (read-only) cwd
 *   <task>/io/    captured output; never visible to the program
 */
class Runner {
 public:
  Runner(const Config& config, ApiClient& api) : config_(config), api_(api) {}

  /** Never throws for problems with the submission; those become verdicts. */
  Report judge(const Task& task);

  /**
   * Compiles and runs a hello-world program in `language` inside the
   * sandbox. Returns an empty string when the toolchain works, the reason
   * otherwise. Languages whose source extension it has no sample for are
   * assumed to work.
   */
  std::string check_toolchain(const std::string& language);

 private:
  struct Failure {
    Verdict verdict;
    std::string message;
  };
  /** Creates `<root>/box` and `<root>/io`, saves the source and compiles it. */
  std::optional<Failure> build(const LanguageSpec& spec, const std::string& code, const std::filesystem::path& root);
  [[nodiscard]] sandbox::RunSpec base_spec(const std::filesystem::path& root) const;

  /** Returns the cached path of a testdata blob, downloading it on a miss. */
  std::string testdata(const Testcase& testcase, bool input);

  const Config& config_;
  ApiClient& api_;
};

}  // namespace judge
