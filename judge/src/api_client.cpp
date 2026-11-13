#include "api_client.hpp"

#include <cstdio>
#include <fstream>

#include <httplib.h>
#include <nlohmann/json.hpp>

namespace judge {
namespace {

using nlohmann::json;

/** Cuts `text` to at most `limit` bytes without splitting a UTF-8 sequence. */
std::string truncated(const std::string& text, std::size_t limit) {
  if (text.size() <= limit) return text;
  std::size_t end = limit;
  while (end > 0 && (static_cast<unsigned char>(text[end]) & 0xC0) == 0x80) --end;
  return text.substr(0, end) + "\n[truncated]";
}

/** Invalid UTF-8 (e.g. from compiler output) is replaced, never fatal. */
std::string dump(const json& value) {
  return value.dump(-1, ' ', false, json::error_handler_t::replace);
}

}  // namespace

ApiClient::ApiClient(const std::string& base_url, const std::string& token) {
  // Split "scheme://host[:port]/optional/prefix" into origin and path prefix.
  const std::size_t scheme_end = base_url.find("://");
  if (scheme_end == std::string::npos) throw ApiError("api_url must start with http:// or https://");
  const std::size_t path_start = base_url.find('/', scheme_end + 3);
  const std::string origin = base_url.substr(0, path_start);
  base_path_ = path_start == std::string::npos ? "" : base_url.substr(path_start);

  http_ = std::make_unique<httplib::Client>(origin);
  if (!http_->is_valid()) throw ApiError("cannot create an HTTP client for " + origin + " (HTTPS needs OpenSSL)");
  http_->set_bearer_token_auth(token);
  http_->set_connection_timeout(10);
  http_->set_read_timeout(60);
  http_->set_write_timeout(60);
  http_->set_keep_alive(true);
}

ApiClient::~ApiClient() = default;

std::string ApiClient::post(const std::string& procedure, const std::string& body) {
  const std::string path = base_path_ + procedure;
  auto response = http_->Post(path, body, "application/json");
  if (!response) throw ApiError("POST " + path + " failed: " + httplib::to_string(response.error()));
  if (response->status < 200 || response->status >= 300) {
    throw ApiError(
        format("POST %s returned HTTP %d: %s", path.c_str(), response->status, truncated(response->body, 300).c_str()));
  }
  return std::move(response->body);
}

std::optional<Task> ApiClient::fetch(const std::vector<std::string>& languages) {
  try {
    const json reply = json::parse(post("/judge/fetch", dump({{"languages", languages}})));
    const json& item = reply.at("task");
    if (item.is_null()) return std::nullopt;

    Task task;
    item.at("submissionId").get_to(task.submission_id);
    item.at("problemId").get_to(task.problem_id);
    item.at("language").get_to(task.language);
    item.at("code").get_to(task.code);
    item.at("timeLimitMs").get_to(task.time_limit_ms);
    item.at("memoryLimitKb").get_to(task.memory_limit_kb);
    for (const json& entry : item.at("testcases")) {
      Testcase testcase;
      entry.at("id").get_to(testcase.id);
      entry.at("ordinal").get_to(testcase.ordinal);
      entry.at("inputSha256").get_to(testcase.input_sha256);
      entry.at("outputSha256").get_to(testcase.output_sha256);
      task.testcases.push_back(std::move(testcase));
    }
    return task;
  } catch (const json::exception& error) {
    throw ApiError(std::string("malformed /judge/fetch response: ") + error.what());
  }
}

void ApiClient::download_testdata(int testcase_id, const std::string& kind, const std::string& destination) {
  const std::string data = post("/judge/testdata", dump({{"testcaseId", testcase_id}, {"kind", kind}}));
  // Write-then-rename so a crash never leaves a truncated file in the cache.
  const std::string partial = destination + ".part";
  {
    std::ofstream file(partial, std::ios::binary | std::ios::trunc);
    file.write(data.data(), static_cast<std::streamsize>(data.size()));
    if (!file.flush()) throw ApiError("cannot write " + partial);
  }
  if (std::rename(partial.c_str(), destination.c_str()) != 0) throw ApiError("cannot move testdata into the cache");
}

void ApiClient::report(const Report& report) {
  json body = {
      {"submissionId", report.submission_id},
      {"compileMessage", truncated(report.compile_message, 16000)},
      {"results", json::array()},
  };
  if (report.verdict) body["verdict"] = static_cast<int>(*report.verdict);
  for (const TestResult& result : report.results) {
    body["results"].push_back({
        {"testcaseId", result.testcase_id},
        {"verdict", static_cast<int>(result.verdict)},
        {"timeMs", result.time_ms},
        {"memoryKb", result.memory_kb},
        {"score", result.score},
        {"message", truncated(result.message, 1000)},
    });
  }
  post("/judge/report", dump(body));
}

}  // namespace judge
