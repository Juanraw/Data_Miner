// Herramienta de verificacion manual contra datos reales: no corre dentro del
// build de Docker (los datasets en data/raw/ solo existen como volumen en
// runtime, no en la imagen — ver docs/adr/005-docker-persistence.md), se
// invoca explicitamente, ej.:
//   docker compose run --rm app /app/build/set_importer_real_test \
//       /app/data/raw/ds004504-sample/sub-001_task-eyesclosed_eeg.set

#include "importers/SetImporter.hpp"

#include <cstdio>

int main(int argc, char** argv) {
    if (argc != 2) {
        std::fprintf(stderr, "Uso: %s <ruta-a-archivo.set>\n", argv[0]);
        return 2;
    }

    try {
        dataminer::core::SignalData signal = dataminer::importers::importSet(argv[1]);
        const auto& meta = signal.metadata();

        std::printf("Importado: %s\n", argv[1]);
        std::printf("  Canales: %zu, Muestras: %zu, srate: %.2f Hz\n",
                    signal.buffer().nChannels(), signal.buffer().nSamples(), meta.sampling_rate_hz);
        std::printf("  Duracion: %.2f s\n",
                    static_cast<double>(signal.buffer().nSamples()) / meta.sampling_rate_hz);
        std::printf("  Referencia: '%s'  Sujeto: '%s'\n", meta.reference.c_str(),
                    meta.subject_id.c_str());
        std::printf("  Eventos: %zu\n", meta.events.size());
        std::printf("  Epocado: %s\n", meta.epochs ? "si" : "no (continuo)");

        std::printf("  Primeros canales: ");
        for (std::size_t i = 0; i < meta.channels.size() && i < 5; ++i) {
            std::printf("%s ", meta.channels[i].label.c_str());
        }
        std::printf("\n");

        std::printf("  Primeras 5 muestras del canal 0: ");
        for (std::size_t s = 0; s < 5 && s < signal.buffer().nSamples(); ++s) {
            std::printf("%.4f ", signal.buffer().at(0, s));
        }
        std::printf("\n");

        std::printf("  isConsistent(): %s\n", signal.isConsistent() ? "true" : "false");

        return signal.isConsistent() ? 0 : 1;
    } catch (const std::exception& e) {
        std::fprintf(stderr, "Error importando '%s': %s\n", argv[1], e.what());
        return 1;
    }
}
