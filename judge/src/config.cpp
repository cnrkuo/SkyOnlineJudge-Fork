#include "config.hpp"

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <stdexcept>

#include <nlohmann/json.hpp>

namespace judge {

std::map<std::string, LanguageSpec> default_languages() {
  return {
      {"c", {"main.c", {"/usr/bin/gcc", "-std=c11", "-O2", "-o", "main", "main.c", "-lm"}, {"./main"}}},
      {"cpp", {"main.cpp", {"/usr/bin/g++", "-std=c++17", "-O2", "-o", "main", "main.cpp"}, {"./main"}}},
      {"cpp23", {"main.cpp", {"/usr/bin/g++", "-std=c++23", "-O2", "-o", "main", "main.cpp"}, {"./main"}}},
      // Clang with LLVM's libc++ instead of libstdc++ (apt: clang libc++-dev libc++abi-dev).
      {"clang-cpp17",
       {"main.cpp", {"/usr/bin/clang++", "-std=c++17", "-stdlib=libc++", "-O2", "-o", "main", "main.cpp"}, {"./main"}}},
      {"clang-cpp23",
       {"main.cpp", {"/usr/bin/clang++", "-std=c++23", "-stdlib=libc++", "-O2", "-o", "main", "main.cpp"}, {"./main"}}},
      // Byte-compiling surfaces syntax errors as a compile error.
      {"py3", {"main.py", {"/usr/bin/python3", "-m", "py_compile", "main.py"}, {"/usr/bin/python3", "main.py"}}},
  };
}

Config load_config(const std::string& path) {
  Config config;
  config.languages = default_languages();

  if (!path.empty()) {
    std::ifstream file(path);
    if (!file) throw std::runtime_error("cannot open config file " + path);
    nlohmann::json json;
    try {
      json = nlohmann::json::parse(file, nullptr, true, /*ignore_comments=*/true);
    } catch (const nlohmann::json::exception& error) {
      throw std::runtime_error("invalid config file " + path + ": " + error.what());
    }

    try {
      const auto read = [&json](const char* key, auto& target) {
        if (json.contains(key)) json.at(key).get_to(target);
      };
      read("api_url", config.api_url);
      read("token", config.token);
      read("work_dir", config.work_dir);
      read("cache_dir", config.cache_dir);
      read("poll_interval_ms", config.poll_interval_ms);
      read("run_uid", config.run_uid);
      read("run_gid", config.run_gid);
      read("nsjail_path", config.nsjail_path);
      read("output_limit_kb", config.output_limit_kb);
      read("compile_time_ms", config.compile_time_ms);
      read("compile_memory_kb", config.compile_memory_kb);
      read("max_processes", config.max_processes);
      if (json.contains("languages")) {
        for (const auto& [id, spec] : json.at("languages").items()) {
          LanguageSpec language;
          spec.at("source").get_to(language.source);
          if (spec.contains("compile")) spec.at("compile").get_to(language.compile);
          spec.at("run").get_to(language.run);
          config.languages[id] = std::move(language);
        }
      }
    } catch (const nlohmann::json::exception& error) {
      throw std::runtime_error("invalid config file " + path + ": " + error.what());
    }
  }

  if (const char* url = std::getenv("SKYOJ_API_URL"); url && *url != '\0') config.api_url = url;
  if (const char* token = std::getenv("SKYOJ_JUDGE_TOKEN"); token && *token != '\0') config.token = token;

  if (config.token.empty()) throw std::runtime_error("no judge token configured (\"token\" or SKYOJ_JUDGE_TOKEN)");
  while (!config.api_url.empty() && config.api_url.back() == '/') config.api_url.pop_back();
  config.work_dir = std::filesystem::absolute(config.work_dir).string();
  config.cache_dir = std::filesystem::absolute(config.cache_dir).string();
  return config;
}

}  // namespace judge
