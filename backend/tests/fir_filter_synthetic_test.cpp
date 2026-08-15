// Valida FirFilter con una señal sintética de frecuencias conocidas, sin
// depender de ninguna librería externa de referencia (scipy/MATLAB no están
// disponibles en este entorno de build). La magnitud de cada tono se mide
// por correlación directa con seno/coseno a esa frecuencia (equivalente a un
// bin de DFT) — método exacto para señales con un número entero de ciclos.

#include "algorithms/FirFilter.hpp"
#include "core/SignalData.hpp"

#include <cassert>
#include <cmath>
#include <cstdio>
#include <vector>

using namespace dataminer::core;
using namespace dataminer::algorithms;

namespace {

constexpr double kPi = 3.14159265358979323846;

double toneMagnitude(const float* signal, std::size_t n, double freq_hz, double srate) {
    double re = 0.0, im = 0.0;
    for (std::size_t i = 0; i < n; ++i) {
        double angle = 2.0 * kPi * freq_hz * static_cast<double>(i) / srate;
        re += signal[i] * std::cos(angle);
        im += signal[i] * std::sin(angle);
    }
    return 2.0 * std::sqrt(re * re + im * im) / static_cast<double>(n);
}

double mean(const float* signal, std::size_t n) {
    double sum = 0.0;
    for (std::size_t i = 0; i < n; ++i) sum += signal[i];
    return sum / static_cast<double>(n);
}

SignalData makeToneSignal(double srate, std::size_t n_samples,
                           const std::vector<std::pair<double, double>>& tones_amp_freq,
                           double dc_offset = 0.0) {
    SignalMetadata meta;
    meta.sampling_rate_hz = srate;
    meta.channels = {ChannelInfo{"synthetic", "", {}, {}, {}}};

    SignalBuffer buffer(1, n_samples);
    for (std::size_t i = 0; i < n_samples; ++i) {
        double v = dc_offset;
        for (const auto& [amp, freq] : tones_amp_freq) {
            v += amp * std::sin(2.0 * kPi * freq * static_cast<double>(i) / srate);
        }
        buffer.at(0, i) = static_cast<float>(v);
    }
    return SignalData(std::move(meta), std::move(buffer));
}

} // namespace

int main() {
    const double srate = 200.0;
    const std::size_t n_samples = 2000; // 10 s, resolución espectral 0.1 Hz

    // --- Caso 1: pasa-bajos separa un tono de 5 Hz de uno de 40 Hz ---
    {
        SignalData input = makeToneSignal(srate, n_samples, {{1.0, 5.0}, {1.0, 40.0}});

        FirFilterParams params;
        params.type = FilterType::LowPass;
        params.high_hz = 15.0;
        params.n_taps = 101;

        SignalData output = applyFirFilter(input, params);
        assert(output.isConsistent());
        assert(output.metadata().provenance.size() == 1);
        assert(output.metadata().provenance[0].stage_name == "fir_filter");

        const float* out_ch = output.buffer().channelData(0);
        double mag5 = toneMagnitude(out_ch, n_samples, 5.0, srate);
        double mag40 = toneMagnitude(out_ch, n_samples, 40.0, srate);

        std::printf("LowPass: mag(5Hz)=%.4f (esperado ~1.0), mag(40Hz)=%.4f (esperado ~0.0)\n", mag5,
                    mag40);
        assert(mag5 > 0.85 && mag5 < 1.15); // banda de paso preservada
        assert(mag40 < 0.10);               // banda de rechazo fuertemente atenuada
    }

    // --- Caso 2: pasa-altos elimina un offset DC preservando un tono de 5 Hz ---
    {
        SignalData input = makeToneSignal(srate, n_samples, {{1.0, 5.0}}, /*dc_offset=*/10.0);

        FirFilterParams params;
        params.type = FilterType::HighPass;
        params.low_hz = 1.0;
        params.n_taps = 101;

        SignalData output = applyFirFilter(input, params);
        assert(output.isConsistent());

        const float* out_ch = output.buffer().channelData(0);
        double dc_after = mean(out_ch, n_samples);
        double mag5 = toneMagnitude(out_ch, n_samples, 5.0, srate);

        std::printf("HighPass: DC tras filtrar=%.4f (esperado ~0.0), mag(5Hz)=%.4f (esperado ~1.0)\n",
                    dc_after, mag5);
        assert(std::abs(dc_after) < 0.05);
        assert(mag5 > 0.85 && mag5 < 1.15);
    }

    // --- Caso 3: pasa-banda aísla 20 Hz entre 5 Hz y 60 Hz ---
    {
        SignalData input =
            makeToneSignal(srate, n_samples, {{1.0, 5.0}, {1.0, 20.0}, {1.0, 60.0}});

        FirFilterParams params;
        params.type = FilterType::BandPass;
        params.low_hz = 12.0;
        params.high_hz = 28.0;
        params.n_taps = 151;

        SignalData output = applyFirFilter(input, params);
        assert(output.isConsistent());

        const float* out_ch = output.buffer().channelData(0);
        double mag5 = toneMagnitude(out_ch, n_samples, 5.0, srate);
        double mag20 = toneMagnitude(out_ch, n_samples, 20.0, srate);
        double mag60 = toneMagnitude(out_ch, n_samples, 60.0, srate);

        std::printf("BandPass: mag(5Hz)=%.4f, mag(20Hz)=%.4f (esperado ~1.0), mag(60Hz)=%.4f\n", mag5,
                    mag20, mag60);
        assert(mag5 < 0.10);
        assert(mag20 > 0.85 && mag20 < 1.15);
        assert(mag60 < 0.10);
    }

    std::printf("fir_filter_synthetic_test: OK\n");
    return 0;
}
