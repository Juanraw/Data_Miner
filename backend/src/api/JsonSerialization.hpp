#pragma once

#include "DatasetCatalog.hpp"
#include "Preview.hpp"
#include "core/SignalData.hpp"

#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace dataminer::api {

nlohmann::json datasetsToJson(const std::vector<DatasetEntry>& datasets);

nlohmann::json signalSummaryToJson(const std::string& id, const core::SignalData& signal,
                                    long long import_time_ms);

nlohmann::json previewToJson(const PreviewResult& preview, const core::SignalMetadata& meta,
                              std::size_t channel);

} // namespace dataminer::api
