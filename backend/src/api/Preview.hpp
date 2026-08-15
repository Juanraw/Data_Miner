#pragma once

#include "core/SignalData.hpp"

#include <cstddef>
#include <vector>

namespace dataminer::api {

struct PreviewBucket {
    float min_value;
    float max_value;
};

struct PreviewResult {
    std::size_t start_sample = 0;
    std::size_t end_sample = 0;
    std::size_t bucket_samples = 1;
    std::vector<PreviewBucket> buckets;
};

// Decima el canal 'channel' de [start_sample, end_sample) a como máximo
// 'max_points' buckets, conservando min/max por bucket — preserva picos que
// una decimación por promedio o stride perdería. El navegador nunca recibe
// la matriz completa (ver docs/adr/006-large-dataset-transfer.md).
PreviewResult decimateChannel(const core::SignalData& signal, std::size_t channel,
                               std::size_t start_sample, std::size_t end_sample,
                               std::size_t max_points);

} // namespace dataminer::api
