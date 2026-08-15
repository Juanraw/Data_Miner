#include "SignalData.hpp"

namespace dataminer::core {

SignalData::SignalData(SignalMetadata metadata, SignalBuffer buffer)
    : metadata_(std::move(metadata)), buffer_(std::move(buffer)) {}

bool SignalData::isConsistent() const {
    if (metadata_.channels.size() != buffer_.nChannels()) {
        return false;
    }
    if (metadata_.sampling_rate_hz <= 0.0) {
        return false;
    }
    if (metadata_.epochs) {
        const auto& epochs = *metadata_.epochs;
        if (epochs.n_epochs == 0 || epochs.samples_per_epoch == 0) {
            return false;
        }
        if (epochs.n_epochs * epochs.samples_per_epoch != buffer_.nSamples()) {
            return false;
        }
    }
    for (const auto& event : metadata_.events) {
        if (event.latency_samples < 0.0) {
            return false;
        }
    }
    return true;
}

} // namespace dataminer::core
