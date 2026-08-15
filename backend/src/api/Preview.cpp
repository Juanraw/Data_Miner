#include "Preview.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

namespace dataminer::api {

PreviewResult decimateChannel(const core::SignalData& signal, std::size_t channel,
                               std::size_t start_sample, std::size_t end_sample,
                               std::size_t max_points) {
    const auto& buffer = signal.buffer();
    if (channel >= buffer.nChannels()) {
        throw std::out_of_range("decimateChannel: canal fuera de rango");
    }

    // Ambos extremos se recortan al tamaño real del buffer: un viewport
    // compartido entre varias vistas (ver App.tsx) puede pedir un rango que
    // excede la duración de ESTE dataset en particular (p.ej. comparando un
    // sujeto de 600s con uno de 300s) -- start_sample sin recortar quedaba
    // reportado más allá del final real, dando una respuesta "vacía" difícil
    // de distinguir de un error real.
    start_sample = std::min(start_sample, buffer.nSamples());
    end_sample = std::min(end_sample, buffer.nSamples());
    if (max_points == 0) max_points = 1;

    PreviewResult result;
    result.start_sample = start_sample;
    result.end_sample = end_sample;

    if (start_sample >= end_sample) {
        result.bucket_samples = 1;
        return result;
    }

    std::size_t range = end_sample - start_sample;
    std::size_t bucket_samples = std::max<std::size_t>(1, (range + max_points - 1) / max_points);
    std::size_t n_buckets = (range + bucket_samples - 1) / bucket_samples;

    const float* channel_data = buffer.channelData(channel);
    result.bucket_samples = bucket_samples;
    result.buckets.reserve(n_buckets);

    for (std::size_t b = 0; b < n_buckets; ++b) {
        std::size_t bucket_start = start_sample + b * bucket_samples;
        std::size_t bucket_end = std::min(bucket_start + bucket_samples, end_sample);

        float mn = std::numeric_limits<float>::infinity();
        float mx = -std::numeric_limits<float>::infinity();
        for (std::size_t i = bucket_start; i < bucket_end; ++i) {
            mn = std::min(mn, channel_data[i]);
            mx = std::max(mx, channel_data[i]);
        }
        result.buckets.push_back(PreviewBucket{mn, mx});
    }
    return result;
}

} // namespace dataminer::api
