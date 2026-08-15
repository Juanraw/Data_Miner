#include "SignalExport.hpp"

#include <nlohmann/json.hpp>

#include <chrono>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <sstream>

namespace dataminer::api {

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace {

std::string isoTimestamp() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm_utc{};
#if defined(_WIN32)
    gmtime_s(&tm_utc, &t);
#else
    gmtime_r(&t, &tm_utc);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm_utc, "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

std::string stripSetExtension(const std::string& id) {
    if (id.size() > 4 && id.substr(id.size() - 4) == ".set") {
        return id.substr(0, id.size() - 4);
    }
    return id;
}

} // namespace

SaveResult saveSignal(const core::SignalData& signal, const std::string& dataset_id,
                       const std::string& label, const std::string& processed_root) {
    fs::path relative_dir = stripSetExtension(dataset_id);
    fs::path out_dir = fs::path(processed_root) / relative_dir;
    fs::create_directories(out_dir);

    std::string bin_filename = label + ".bin";
    std::string json_filename = label + ".json";

    const auto& buffer = signal.buffer();
    {
        std::ofstream bin_file(out_dir / bin_filename, std::ios::binary);
        bin_file.write(reinterpret_cast<const char*>(buffer.data()),
                        static_cast<std::streamsize>(buffer.nChannels() * buffer.nSamples() *
                                                       sizeof(float)));
    }

    const auto& meta = signal.metadata();

    json channel_labels = json::array();
    for (const auto& ch : meta.channels) channel_labels.push_back(ch.label);

    json events = json::array();
    for (const auto& ev : meta.events) {
        events.push_back({{"type", ev.type},
                           {"latency_samples", ev.latency_samples},
                           {"duration_samples", ev.duration_samples}});
    }

    json provenance = json::array();
    for (const auto& stage : meta.provenance) {
        provenance.push_back({{"stage_name", stage.stage_name},
                               {"algorithm_version", stage.algorithm_version},
                               {"params", stage.params}});
    }

    json manifest;
    manifest["dataset_id"] = dataset_id;
    manifest["label"] = label;
    manifest["n_channels"] = buffer.nChannels();
    manifest["n_samples"] = buffer.nSamples();
    manifest["sampling_rate_hz"] = meta.sampling_rate_hz;
    manifest["channel_labels"] = channel_labels;
    manifest["reference"] = meta.reference;
    manifest["subject_id"] = meta.subject_id;
    manifest["events"] = events;
    manifest["epoched"] = meta.epochs.has_value();
    manifest["provenance"] = provenance;
    manifest["source_path"] = meta.source_path;
    manifest["buffer_file"] = bin_filename;
    manifest["buffer_dtype"] = "float32";
    manifest["buffer_layout"] = "channel_contiguous";
    manifest["saved_at"] = isoTimestamp();

    std::ofstream json_file(out_dir / json_filename);
    json_file << manifest.dump(2);

    return SaveResult{relative_dir.generic_string(), bin_filename, json_filename};
}

} // namespace dataminer::api
