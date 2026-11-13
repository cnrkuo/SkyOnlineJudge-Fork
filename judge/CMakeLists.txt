cmake_minimum_required(VERSION 3.20)
project(skyoj_judge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
# compile_commands.json for clang-tidy (`pnpm lint:judge`) and editors.
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# Third-party code is fetched at configure time; both libraries are
# header-only and pinned to a release.
include(FetchContent)
FetchContent_Declare(nlohmann_json
  URL https://github.com/nlohmann/json/releases/download/v3.11.3/json.tar.xz
  URL_HASH SHA256=d6c65aca6b1ed68e7a182f4757257b107ae403032760ed6ef121c9d55e81757d)
FetchContent_MakeAvailable(nlohmann_json)

set(HTTPLIB_VERSION v0.18.3)
set(HTTPLIB_DIR ${CMAKE_BINARY_DIR}/_deps/httplib-${HTTPLIB_VERSION})
if(NOT EXISTS ${HTTPLIB_DIR}/httplib.h)
  file(DOWNLOAD
    https://raw.githubusercontent.com/yhirose/cpp-httplib/${HTTPLIB_VERSION}/httplib.h
    ${HTTPLIB_DIR}/httplib.h
    EXPECTED_HASH SHA256=a0a0c13dc086663863dbe6730a19716f7d3744904b6205496e8301750814dbd5
    TLS_VERIFY ON)
endif()
add_library(httplib INTERFACE)
target_include_directories(httplib SYSTEM INTERFACE ${HTTPLIB_DIR})
find_package(Threads REQUIRED)
target_link_libraries(httplib INTERFACE Threads::Threads)
# HTTPS towards the API is available when OpenSSL development files are installed.
find_package(OpenSSL QUIET)
if(OpenSSL_FOUND)
  target_compile_definitions(httplib INTERFACE CPPHTTPLIB_OPENSSL_SUPPORT)
  target_link_libraries(httplib INTERFACE OpenSSL::SSL OpenSSL::Crypto)
endif()

# Everything except main() lives in a library so the tests can link it.
add_library(judge_core STATIC
  src/api_client.cpp
  src/checker.cpp
  src/config.cpp
  src/runner.cpp
  src/sandbox.cpp)
target_include_directories(judge_core PUBLIC src)
target_link_libraries(judge_core PUBLIC nlohmann_json::nlohmann_json httplib)
target_compile_options(judge_core PUBLIC -Wall -Wextra -Wpedantic)

add_executable(skyoj-judge src/main.cpp)
target_link_libraries(skyoj-judge PRIVATE judge_core)

enable_testing()
add_executable(judge_tests tests/tests.cpp)
target_link_libraries(judge_tests PRIVATE judge_core)
add_test(NAME judge_tests COMMAND judge_tests)

install(TARGETS skyoj-judge RUNTIME DESTINATION bin)
