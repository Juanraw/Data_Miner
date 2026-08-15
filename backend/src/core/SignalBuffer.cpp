#include "SignalBuffer.hpp"

#include <stdexcept>

namespace dataminer::core {

SignalBuffer::SignalBuffer(std::size_t n_channels, std::size_t n_samples)
    : n_channels_(n_channels),
      n_samples_(n_samples),
      storage_(n_channels * n_samples, 0.0f) {
    if (n_channels == 0 || n_samples == 0) {
        throw std::invalid_argument("SignalBuffer: n_channels y n_samples deben ser > 0");
    }
}

float* SignalBuffer::channelData(std::size_t channel) {
    if (channel >= n_channels_) {
        throw std::out_of_range("SignalBuffer::channelData: canal fuera de rango");
    }
    return storage_.data() + channel * n_samples_;
}

const float* SignalBuffer::channelData(std::size_t channel) const {
    if (channel >= n_channels_) {
        throw std::out_of_range("SignalBuffer::channelData: canal fuera de rango");
    }
    return storage_.data() + channel * n_samples_;
}

float& SignalBuffer::at(std::size_t channel, std::size_t sample) {
    if (sample >= n_samples_) {
        throw std::out_of_range("SignalBuffer::at: muestra fuera de rango");
    }
    return channelData(channel)[sample];
}

float SignalBuffer::at(std::size_t channel, std::size_t sample) const {
    if (sample >= n_samples_) {
        throw std::out_of_range("SignalBuffer::at: muestra fuera de rango");
    }
    return channelData(channel)[sample];
}

} // namespace dataminer::core
