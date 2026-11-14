#include <doctest.h>

#include <unistd.h>

#include "cgroup.hpp"
#include "support.hpp"

namespace fs = std::filesystem;
using judge::cgroup::default_instance_name;
using judge::cgroup::prepare_memory_cgroup;

TEST_CASE("the instance name is unique per process and safe as a directory name") {
  const std::string name = default_instance_name();
  CHECK(name.ends_with("-" + std::to_string(::getpid())));
  CHECK(name.find('/') == std::string::npos);
}

TEST_CASE("without a usable cgroup filesystem the judge is told why") {
  const auto prepared = prepare_memory_cgroup(judge::testing::fresh_dir("not-a-cgroup").string(), "test");
  CHECK_FALSE(prepared.cgroup.has_value());
  if (::geteuid() == 0) {
    CHECK(prepared.unavailable.find("no cgroup v1 memory hierarchy") != std::string::npos);
  } else {
    CHECK(prepared.unavailable == "the judge does not run as root");
  }
}

TEST_CASE("the judge's memory cgroup is created and removed again") {
  const auto& active = judge::testing::sandbox_settings().memory_cgroup;
  if (!active) {
    MESSAGE("skipped: no memory cgroup (run the tests as root)");
    return;
  }
  const auto prepared = prepare_memory_cgroup("/sys/fs/cgroup", "test-" + std::to_string(::getpid()));
  const auto cgroup = prepared.cgroup.value_or(judge::cgroup::MemoryCgroup{});
  REQUIRE(prepared.cgroup.has_value());
  CHECK(cgroup.version == active->version);
  CHECK(fs::is_directory(cgroup.path));
  CHECK(cgroup.path.find("/skyoj-judge/test-") != std::string::npos);
  judge::cgroup::release(cgroup);
  CHECK_FALSE(fs::exists(cgroup.path));
}
