#pragma once

#include "api_client.hpp"
#include "config.hpp"

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

 private:
  /** Returns the cached path of a testdata blob, downloading it on a miss. */
  std::string testdata(const Testcase& testcase, bool input);

  const Config& config_;
  ApiClient& api_;
};

}  // namespace judge
