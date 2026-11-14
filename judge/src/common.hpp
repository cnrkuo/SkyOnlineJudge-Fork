#pragma once

#include <cstdarg>
#include <cstdio>
#include <ctime>
#include <fstream>
#include <optional>
#include <sstream>
#include <string>

namespace judge {

/**
 * Verdict codes. Must stay in sync with `Verdict` in
 * packages/contract/src/enums.ts — they travel as plain integers.
 */
enum class Verdict : int {
  Accepted = 20,
  PresentationError = 25,
  WrongAnswer = 30,
  OutputLimitExceeded = 35,
  RuntimeError = 40,
  TimeLimitExceeded = 50,
  MemoryLimitExceeded = 60,
  RestrictedFunction = 65,
  CompileError = 70,
  JudgeError = 80,
};

/** The whole file, or nothing when it cannot be opened. */
inline std::optional<std::string> read_file(const std::string& path) {
  const std::ifstream file(path, std::ios::binary);
  if (!file) return std::nullopt;
  std::ostringstream buffer;
  buffer << file.rdbuf();
  return std::move(buffer).str();
}

/** printf-style formatting into a std::string. */
[[gnu::format(printf, 1, 2)]] inline std::string format(const char* fmt, ...) {
  va_list args;
  va_start(args, fmt);
  va_list copy;
  va_copy(copy, args);
  const int size = std::vsnprintf(nullptr, 0, fmt, copy);
  va_end(copy);
  std::string out(size > 0 ? static_cast<std::size_t>(size) : 0, '\0');
  if (size > 0) std::vsnprintf(out.data(), out.size() + 1, fmt, args);
  va_end(args);
  return out;
}

/** Timestamped line on stderr; the daemon is expected to run under a supervisor. */
inline void log(const char* level, const std::string& message) {
  char stamp[32];
  const std::time_t now = std::time(nullptr);
  std::tm tm{};
  localtime_r(&now, &tm);
  std::strftime(stamp, sizeof stamp, "%F %T", &tm);
  std::fprintf(stderr, "%s [%s] %s\n", stamp, level, message.c_str());
}

}  // namespace judge
