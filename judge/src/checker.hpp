#pragma once

#include <string>
#include <string_view>

#include "common.hpp"

namespace judge::checker {

struct Outcome {
  Verdict verdict = Verdict::WrongAnswer;
  /** Fraction of the testcase's score awarded, 0..1. */
  double score = 0.0;
  std::string message;
};

/**
 * Default checker, comparing the contestant's output with the expected one.
 *
 * - Accepted: identical after dropping trailing whitespace on every line
 *   and trailing blank lines.
 * - Presentation Error: the whitespace-separated tokens match but the
 *   layout differs.
 * - Wrong Answer otherwise; the message names the first differing line
 *   without revealing the expected content.
 */
Outcome compare(std::string_view expected, std::string_view actual);

/** Reads both files and delegates to compare(). */
Outcome compare_files(const std::string& expected_path, const std::string& actual_path);

}  // namespace judge::checker
