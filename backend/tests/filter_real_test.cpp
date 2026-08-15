// Herramienta de verificacion manual: importa un .set real y aplica un
// pasa-altos de 1 Hz (limpieza de deriva DC tipica en preprocesamiento EEG)
// EN UN WORKER DEL ThreadPool -- prueba end-to-end de que import + algoritmo
// corren en el dominio de computo separado del transporte (ADR-004), sin
// levantar api/ ni el frontend. No corre dentro del build de Docker (necesita
// un dataset real montado en runtime), ej.:
//   docker compose run --rm app /app/build/filter_real_test \
//       /app/data/raw/ds004504-sample/sub-001_task-eyesclosed_eeg.set

#include "algorithms/FirFilter.hpp"
#include "executor/ThreadPool.hpp"
#include "importers/SetImporter.hpp"

#include <cstdio>

namespace {

double mean(const float* data, std::size_t n) {
    double sum = 0.0;
    for (std::size_t i = 0; i < n; ++i) sum += data[i];
    return sum / static_cast<double>(n);
}

} // namespace

int main(int argc, char** argv) {
    if (argc != 2) {
        std::fprintf(stderr, "Uso: %s <ruta-a-archivo.set>\n", argv[0]);
        return 2;
    }

    try {
        dataminer::executor::ThreadPool pool(2);

        auto future = pool.submit([path = std::string(argv[1])] {
            dataminer::core::SignalData raw = dataminer::importers::importSet(path);

            dataminer::algorithms::FirFilterParams params;
            params.type = dataminer::algorithms::FilterType::HighPass;
            params.low_hz = 1.0;
            params.n_taps = 201;

            return dataminer::algorithms::applyFirFilter(raw, params);
        });

        dataminer::core::SignalData filtered = future.get();
        const auto& buf = filtered.buffer();

        std::printf("Filtrado (highpass 1Hz) en worker de ThreadPool: %s\n", argv[1]);
        std::printf("  Canales: %zu, Muestras: %zu\n", buf.nChannels(), buf.nSamples());
        std::printf("  Etapas de proveniencia: %zu\n", filtered.metadata().provenance.size());

        std::printf("  Media por canal (antes vs. despues de highpass, deberia bajar hacia 0):\n");
        for (std::size_t ch = 0; ch < buf.nChannels() && ch < 5; ++ch) {
            std::printf("    %s: media=%.4f\n", filtered.metadata().channels[ch].label.c_str(),
                        mean(buf.channelData(ch), buf.nSamples()));
        }

        std::printf("  isConsistent(): %s\n", filtered.isConsistent() ? "true" : "false");
        return filtered.isConsistent() ? 0 : 1;
    } catch (const std::exception& e) {
        std::fprintf(stderr, "Error: %s\n", e.what());
        return 1;
    }
}
