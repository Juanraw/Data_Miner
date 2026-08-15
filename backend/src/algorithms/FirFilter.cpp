#include "FirFilter.hpp"

#include <cmath>
#include <stdexcept>

namespace dataminer::algorithms {

namespace {

constexpr double kPi = 3.14159265358979323846;

double sinc(double x) {
    if (std::abs(x) < 1e-12) return 1.0;
    double px = kPi * x;
    return std::sin(px) / px;
}

// Mapea un índice fuera de rango [0, n) a su reflejo dentro del rango
// ("reflect", sin repetir la muestra de borde — igual que numpy/scipy).
// Evita el transitorio grande que produce el relleno con ceros al filtrar
// señales con offset DC (el caso típico de un pasa-altos en EEG real).
long long reflectIndex(long long idx, long long n) {
    if (n == 1) return 0;
    long long period = 2 * (n - 1);
    long long m = idx % period;
    if (m < 0) m += period;
    return (m < n) ? m : period - m;
}

// Sinc ideal ventaneada con Hamming, normalizada a ganancia unitaria en DC.
std::vector<double> designLowPass(double cutoff_hz, std::size_t n_taps, double srate) {
    double fc = cutoff_hz / srate; // ciclos/muestra
    std::size_t M = (n_taps - 1) / 2;
    std::vector<double> h(n_taps);
    double sum = 0.0;
    for (std::size_t n = 0; n < n_taps; ++n) {
        double m = static_cast<double>(n) - static_cast<double>(M);
        double ideal = 2.0 * fc * sinc(2.0 * fc * m);
        double window = 0.54 - 0.46 * std::cos(2.0 * kPi * static_cast<double>(n) /
                                                 static_cast<double>(n_taps - 1));
        h[n] = ideal * window;
        sum += h[n];
    }
    for (auto& v : h) v /= sum;
    return h;
}

} // namespace

std::vector<double> designFirKernel(const FirFilterParams& params, double sampling_rate_hz) {
    if (params.n_taps < 3 || params.n_taps % 2 == 0) {
        throw std::invalid_argument("FirFilterParams::n_taps debe ser impar y >= 3");
    }
    if (sampling_rate_hz <= 0.0) {
        throw std::invalid_argument("sampling_rate_hz debe ser > 0");
    }

    switch (params.type) {
        case FilterType::LowPass: {
            if (params.high_hz <= 0.0) {
                throw std::invalid_argument("LowPass requiere high_hz > 0");
            }
            return designLowPass(params.high_hz, params.n_taps, sampling_rate_hz);
        }
        case FilterType::HighPass: {
            if (params.low_hz <= 0.0) {
                throw std::invalid_argument("HighPass requiere low_hz > 0");
            }
            // Inversión espectral de un pasa-bajos: delta - h_lp.
            auto lp = designLowPass(params.low_hz, params.n_taps, sampling_rate_hz);
            std::size_t M = (params.n_taps - 1) / 2;
            std::vector<double> h(params.n_taps);
            for (std::size_t n = 0; n < params.n_taps; ++n) h[n] = -lp[n];
            h[M] += 1.0;
            return h;
        }
        case FilterType::BandPass: {
            if (params.low_hz <= 0.0 || params.high_hz <= params.low_hz) {
                throw std::invalid_argument("BandPass requiere 0 < low_hz < high_hz");
            }
            // Resta espectral de dos pasa-bajos (high - low).
            auto lp_high = designLowPass(params.high_hz, params.n_taps, sampling_rate_hz);
            auto lp_low = designLowPass(params.low_hz, params.n_taps, sampling_rate_hz);
            std::vector<double> h(params.n_taps);
            for (std::size_t n = 0; n < params.n_taps; ++n) h[n] = lp_high[n] - lp_low[n];
            return h;
        }
    }
    throw std::invalid_argument("FilterType no reconocido");
}

core::SignalData applyFirFilter(const core::SignalData& input, const FirFilterParams& params) {
    double srate = input.metadata().sampling_rate_hz;
    std::vector<double> kernel = designFirKernel(params, srate);
    std::size_t n_taps = kernel.size();
    std::size_t M = (n_taps - 1) / 2;

    std::size_t n_channels = input.buffer().nChannels();
    std::size_t n_samples = input.buffer().nSamples();

    // Convolución centrada (compensa el retardo de grupo constante de un FIR
    // simétrico de fase lineal) con extensión por reflexión en los bordes.
    core::SignalBuffer out_buffer(n_channels, n_samples);
    long long n = static_cast<long long>(n_samples);
    for (std::size_t ch = 0; ch < n_channels; ++ch) {
        const float* in_channel = input.buffer().channelData(ch);
        for (std::size_t i = 0; i < n_samples; ++i) {
            double sum = 0.0;
            for (std::size_t k = 0; k < n_taps; ++k) {
                long long idx = static_cast<long long>(i + M) - static_cast<long long>(k);
                sum += kernel[k] * static_cast<double>(in_channel[reflectIndex(idx, n)]);
            }
            out_buffer.at(ch, i) = static_cast<float>(sum);
        }
    }

    core::SignalMetadata out_meta = input.metadata();
    core::ProvenanceStage stage;
    stage.stage_name = "fir_filter";
    stage.algorithm_version = "1.0.0";
    stage.params["type"] = params.type == FilterType::LowPass    ? "lowpass"
                            : params.type == FilterType::HighPass ? "highpass"
                                                                   : "bandpass";
    stage.params["low_hz"] = std::to_string(params.low_hz);
    stage.params["high_hz"] = std::to_string(params.high_hz);
    stage.params["n_taps"] = std::to_string(params.n_taps);
    out_meta.provenance.push_back(std::move(stage));

    return core::SignalData(std::move(out_meta), std::move(out_buffer));
}

} // namespace dataminer::algorithms
