#pragma once

#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace judge {

/** How to build and run submissions written in one language. */
struct LanguageSpec {
  /** File name the submitted code is saved as. */
  std::string source;
  /** Empty when the language needs no build step. */
  std::vector<std::string> compile;
  std::vector<std::string> run;
};

struct Config {
  std::string api_url = "http://127.0.0.1:3001";
  std::string token;
  /** Scratch space; one sub-directory per task, removed afterwards. */
  std::string work_dir = "/var/lib/skyoj-judge/work";
  /** Content-addressed testdata cache. */
  std::string cache_dir = "/var/lib/skyoj-judge/cache";
  /** Delay between polls while the queue is empty. */
  int poll_interval_ms = 1000;

  /** Identity submissions run as when the judge itself runs as root. */
  unsigned run_uid = 65534;
  unsigned run_gid = 65534;
  /** The nsjail binary that every compilation and run goes through. */
  std::string nsjail_path = "nsjail";
  /**
   * Enforce memory limits with a cgroup when the system allows it (root and
   * a writable cgroup filesystem); otherwise only an address-space rlimit.
   */
  bool memory_cgroup = true;
  /** Where the cgroup filesystem is mounted. */
  std::string cgroup_root = "/sys/fs/cgroup";

  std::int64_t output_limit_kb = 65536;
  std::int64_t compile_time_ms = 15000;
  std::int64_t compile_memory_kb = 2097152;
  int max_processes = 64;

  /** Keyed by the language ids of the API contract ("c", "cpp", "cpp23", "py3"). */
  std::map<std::string, LanguageSpec> languages;
};

/** Languages available out of the box; config files may override or extend them. */
std::map<std::string, LanguageSpec> default_languages();

/**
 * Loads a JSON config file. `SKYOJ_API_URL` and `SKYOJ_JUDGE_TOKEN` in the
 * environment take precedence over the file. Throws std::runtime_error on
 * malformed or incomplete configuration.
 */
Config load_config(const std::string& path);

}  // namespace judge
