#include "JsonSerialization.hpp"

namespace dataminer::api {

nlohmann::json datasetsToJson(const std::vector<DatasetEntry>& datasets) {
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& d : datasets) {
        arr.push_back({{"id", d.id}, {"name", d.name}, {"size_bytes", d.size_bytes}});
    }
    return {{"datasets", arr}};
}

nlohmann::json signalSummaryToJson(const std::string& id, const core::SignalData& signal,
                                    long long import_time_ms) {
    const auto& meta = signal.metadata();
    const auto& buffer = signal.buffer();

    nlohmann::json labels = nlohmann::json::array();
    for (const auto& ch : meta.channels) labels.push_back(ch.label);

    nlohmann::json j;
    j["id"] = id;
    j["channels"] = buffer.nChannels();
    j["samples"] = buffer.nSamples();
    j["sampling_rate_hz"] = meta.sampling_rate_hz;
    j["duration_seconds"] = static_cast<double>(buffer.nSamples()) / meta.sampling_rate_hz;
    j["reference"] = meta.reference;
    j["subject_id"] = meta.subject_id;
    j["channel_labels"] = labels;
    j["events"] = meta.events.size();
    j["epoched"] = meta.epochs.has_value();
    if (meta.epochs) {
        j["n_epochs"] = meta.epochs->n_epochs;
        j["samples_per_epoch"] = meta.epochs->samples_per_epoch;
    }
    j["import_time_ms"] = import_time_ms;
    return j;
}

nlohmann::json previewToJson(const PreviewResult& preview, const core::SignalMetadata& meta,
                              std::size_t channel) {
    nlohmann::json min_arr = nlohmann::json::array();
    nlohmann::json max_arr = nlohmann::json::array();
    for (const auto& bucket : preview.buckets) {
        min_arr.push_back(bucket.min_value);
        max_arr.push_back(bucket.max_value);
    }

    nlohmann::json j;
    j["channel"] = channel;
    j["channel_label"] = channel < meta.channels.size() ? meta.channels[channel].label : "";
    j["sampling_rate_hz"] = meta.sampling_rate_hz;
    j["start_sample"] = preview.start_sample;
    j["end_sample"] = preview.end_sample;
    j["bucket_samples"] = preview.bucket_samples;
    j["min"] = min_arr;
    j["max"] = max_arr;
    return j;
}

} // namespace dataminer::api
