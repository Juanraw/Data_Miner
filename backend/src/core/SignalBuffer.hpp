#pragma once

#include <cstddef>
#include <vector>

namespace dataminer::core {

// Buffer de señal en memoria: layout canal-contiguo, float32.
// data()[canal * n_samples() + muestra] es el elemento (canal, muestra).
// Decisión de layout y precisión: ver docs/adr/003-internal-representation.md
class SignalBuffer {
public:
    SignalBuffer(std::size_t n_channels, std::size_t n_samples);

    std::size_t nChannels() const noexcept { return n_channels_; }
    std::size_t nSamples() const noexcept { return n_samples_; }

    float* channelData(std::size_t channel);
    const float* channelData(std::size_t channel) const;

    float& at(std::size_t channel, std::size_t sample);
    float at(std::size_t channel, std::size_t sample) const;

    float* data() noexcept { return storage_.data(); }
    const float* data() const noexcept { return storage_.data(); }

private:
    std::size_t n_channels_;
    std::size_t n_samples_;
    std::vector<float> storage_;
};

} // namespace dataminer::core
