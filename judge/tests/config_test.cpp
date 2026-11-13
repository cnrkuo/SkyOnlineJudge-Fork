#include <doctest.h>

#include <cstdlib>
#include <optional>
#include <stdexcept>
#include <string>

#include "config.hpp"
#include "support.hpp"

using judge::load_config;

namespace {

/** Sets (or, with nullptr, removes) an environment variable, restoring it afterwards. */
class ScopedEnv {
 public:
  ScopedEnv(const char* name, const char* value) : name_(name) {
    if (const char* previous = std::getenv(name)) previous_ = previous;
    if (value != nullptr) {
      ::setenv(name, value, 1);
    } else {
      ::unsetenv(name);
    }
  }
  ScopedEnv(const ScopedEnv&) = delete;
  ScopedEnv& operator=(const ScopedEnv&) = delete;
  ~ScopedEnv() {
    if (previous_) {
      ::setenv(name_, previous_->c_str(), 1);
    } else {
      ::unsetenv(name_);
    }
  }

 private:
  const char* name_;
  std::optional<std::string> previous_;
};

/** The judge's own environment (e.g. in its container) must not leak into these tests. */
struct CleanEnv {
  ScopedEnv url{"SKYOJ_API_URL", nullptr};
  ScopedEnv token{"SKYOJ_JUDGE_TOKEN", nullptr};
};

std::string config_file(const std::string& name, const std::string& json) {
  const auto path = judge::testing::fresh_dir("config") / name;
  judge::testing::write_file(path, json);
  return path.string();
}

}  // namespace

TEST_CASE("a config file overrides the defaults, comments allowed") {
  const CleanEnv clean;
  const auto config = load_config(config_file("full.json", R"({
    // Comments are allowed, like in the example file.
    "api_url": "https://oj.example.com/api/",
    "token": "file-token",
    "work_dir": "/srv/work",
    "max_processes": 8
  })"));
  CHECK(config.api_url == "https://oj.example.com/api");  // trailing slash dropped
  CHECK(config.token == "file-token");
  CHECK(config.work_dir == "/srv/work");
  CHECK(config.max_processes == 8);
  CHECK(config.compile_time_ms == 15000);  // untouched default
}

TEST_CASE("the environment overrides the API address and the token") {
  const CleanEnv clean;
  const ScopedEnv url("SKYOJ_API_URL", "http://api:3001");
  const ScopedEnv token("SKYOJ_JUDGE_TOKEN", "env-token");
  const auto config = load_config(config_file("env.json", R"({"token": "file-token"})"));
  CHECK(config.api_url == "http://api:3001");
  CHECK(config.token == "env-token");
}

TEST_CASE("without a file the judge runs on defaults and the environment") {
  const CleanEnv clean;
  const ScopedEnv token("SKYOJ_JUDGE_TOKEN", "env-token");
  const auto config = load_config("");
  CHECK(config.token == "env-token");
  CHECK(config.languages.size() == 6);
}

TEST_CASE("every built-in language ships a compiler and a run command") {
  const CleanEnv clean;
  for (const auto& [id, spec] : judge::default_languages()) {
    CAPTURE(id);
    CHECK_FALSE(spec.source.empty());
    CHECK_FALSE(spec.run.empty());
  }
  const auto languages = judge::default_languages();
  CHECK(languages.at("clang-cpp23").compile.at(0) == "/usr/bin/clang++");
  CHECK(languages.at("py3").run == std::vector<std::string>{"/usr/bin/python3", "main.py"});
}

TEST_CASE("a config file can replace one language and add another") {
  const CleanEnv clean;
  const auto config = load_config(config_file("languages.json", R"({
    "token": "t",
    "languages": {
      "cpp": {"source": "main.cpp", "compile": ["/usr/bin/g++", "-std=c++20", "-o", "main", "main.cpp"], "run": ["./main"]},
      "lua": {"source": "main.lua", "run": ["/usr/bin/lua", "main.lua"]}
    }
  })"));
  CHECK(config.languages.at("cpp").compile.at(1) == "-std=c++20");
  CHECK(config.languages.at("lua").compile.empty());
  CHECK(config.languages.count("py3") == 1);  // the rest stay
}

TEST_CASE("a broken configuration is refused with a reason") {
  const CleanEnv clean;
  CHECK_THROWS_WITH_AS(load_config("/no/such/config.json"), doctest::Contains("cannot open"), std::runtime_error);
  CHECK_THROWS_WITH_AS(load_config(config_file("bad.json", "{ nope")), doctest::Contains("invalid config"),
                       std::runtime_error);
  CHECK_THROWS_WITH_AS(load_config(config_file("type.json", R"({"token": "t", "max_processes": "many"})")),
                       doctest::Contains("invalid config"), std::runtime_error);
  CHECK_THROWS_WITH_AS(load_config(config_file("empty.json", "{}")), doctest::Contains("no judge token"),
                       std::runtime_error);
}
