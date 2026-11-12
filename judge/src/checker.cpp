#include "checker.hpp"

#include <fstream>
#include <sstream>
#include <vector>

namespace judge::checker {
namespace {

bool is_space(char c) {
  return c == ' ' || c == '\t' || c == '\r' || c == '\n' || c == '\v' || c == '\f';
}

/** Lines without their trailing whitespace, minus trailing blank lines. */
std::vector<std::string_view> normalized_lines(std::string_view text) {
  std::vector<std::string_view> lines;
  std::size_t begin = 0;
  while (begin <= text.size()) {
    std::size_t end = text.find('\n', begin);
    if (end == std::string_view::npos) end = text.size();
    std::string_view line = text.substr(begin, end - begin);
    while (!line.empty() && is_space(line.back())) line.remove_suffix(1);
    lines.push_back(line);
    begin = end + 1;
  }
  while (!lines.empty() && lines.back().empty()) lines.pop_back();
  return lines;
}

/** Advances to the next whitespace-separated token; empty at end of input. */
std::string_view next_token(std::string_view text, std::size_t& position) {
  while (position < text.size() && is_space(text[position])) ++position;
  std::size_t begin = position;
  while (position < text.size() && !is_space(text[position])) ++position;
  return text.substr(begin, position - begin);
}

bool same_tokens(std::string_view a, std::string_view b) {
  std::size_t pa = 0, pb = 0;
  for (;;) {
    std::string_view ta = next_token(a, pa);
    std::string_view tb = next_token(b, pb);
    if (ta != tb) return false;
    if (ta.empty()) return true;
  }
}

bool read_file(const std::string& path, std::string& out) {
  std::ifstream file(path, std::ios::binary);
  if (!file) return false;
  std::ostringstream buffer;
  buffer << file.rdbuf();
  out = std::move(buffer).str();
  return true;
}

}  // namespace

Outcome compare(std::string_view expected, std::string_view actual) {
  const auto want = normalized_lines(expected);
  const auto got = normalized_lines(actual);
  if (want == got) return {Verdict::Accepted, 1.0, ""};
  if (same_tokens(expected, actual)) {
    return {Verdict::PresentationError, 0.0, "Tokens match but whitespace or line breaks differ"};
  }
  std::size_t line = 0;
  while (line < want.size() && line < got.size() && want[line] == got[line]) ++line;
  std::string message;
  if (line >= got.size()) {
    message = format("Output ends early: expected %zu lines, got %zu", want.size(), got.size());
  } else if (line >= want.size()) {
    message = format("Extra output after line %zu", want.size());
  } else {
    message = format("Line %zu differs", line + 1);
  }
  return {Verdict::WrongAnswer, 0.0, message};
}

Outcome compare_files(const std::string& expected_path, const std::string& actual_path) {
  std::string expected, actual;
  if (!read_file(expected_path, expected)) return {Verdict::JudgeError, 0.0, "Cannot read the expected output"};
  if (!read_file(actual_path, actual)) return {Verdict::JudgeError, 0.0, "Cannot read the program output"};
  return compare(expected, actual);
}

}  // namespace judge::checker
