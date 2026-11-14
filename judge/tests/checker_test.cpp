#include <doctest.h>

#include "checker.hpp"
#include "support.hpp"

using judge::Verdict;
using judge::checker::compare;
using judge::checker::compare_files;

TEST_CASE("the checker accepts output that matches line by line") {
  CHECK(compare("1 2\n3\n", "1 2\n3\n").verdict == Verdict::Accepted);
  CHECK(compare("", "").verdict == Verdict::Accepted);
  CHECK(compare("1\n", "1\n").score == 1.0);
}

TEST_CASE("the checker ignores trailing whitespace, CRLF and trailing blank lines") {
  CHECK(compare("1 2\n3\n", "1 2  \r\n3").verdict == Verdict::Accepted);
  CHECK(compare("1 2\n3\n", "1 2\n3\n\n\n").verdict == Verdict::Accepted);
}

TEST_CASE("the checker calls the right tokens in the wrong layout a presentation error") {
  CHECK(compare("1 2\n3\n", "1\n2\n3\n").verdict == Verdict::PresentationError);
  CHECK(compare("1 2\n", " 1 2\n").verdict == Verdict::PresentationError);
  CHECK(compare("1 2\n", " 1 2\n").score == 0.0);
}

TEST_CASE("the checker says where wrong output differs") {
  CHECK(compare("1 2\n3\n", "1 2\n4\n").message == "Line 2 differs");
  CHECK(compare("1\n2\n", "1\n").message == "Output ends early: expected 2 lines, got 1");
  CHECK(compare("1\n", "1\n2\n").message == "Extra output after line 1");
  CHECK(compare("abc", "ABC").verdict == Verdict::WrongAnswer);
}

TEST_CASE("comparing files reports unreadable files as a judge error") {
  const auto dir = judge::testing::fresh_dir("checker");
  judge::testing::write_file(dir / "expected", "42\n");
  judge::testing::write_file(dir / "actual", "42\n");
  CHECK(compare_files((dir / "expected").string(), (dir / "actual").string()).verdict == Verdict::Accepted);
  CHECK(compare_files((dir / "missing").string(), (dir / "actual").string()).verdict == Verdict::JudgeError);
  CHECK(compare_files((dir / "expected").string(), (dir / "missing").string()).verdict == Verdict::JudgeError);
}
