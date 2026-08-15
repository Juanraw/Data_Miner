// Prueba de humo, no una suite de tests formal (eso es Fase 13, ver
// docs/architecture.md). Objetivo: verificar que (a) libmatio está
// correctamente enlazada — ADR-001 — y (b) el modelo de datos interno
// (SignalData/SignalBuffer) se comporta como espera ADR-003. No hay lógica
// de importación de .set/.fdt aquí todavía — eso es Fase 2.

#include "core/SignalData.hpp"

#include <matio.h>

#include <cassert>
#include <cstdio>
#include <utility>

int main() {
    using namespace dataminer::core;

    int major = 0, minor = 0, release = 0;
    Mat_GetLibraryVersion(&major, &minor, &release);
    std::printf("libmatio enlazada: %d.%d.%d\n", major, minor, release);
    assert(major >= 1);

    SignalMetadata meta;
    meta.sampling_rate_hz = 256.0;
    meta.channels = {
        ChannelInfo{"Fz", "uV", {}, {}, {}},
        ChannelInfo{"Cz", "uV", {}, {}, {}},
    };
    meta.reference = "average";
    meta.subject_id = "test-subject";
    meta.events.push_back(Event{"stimulus", 128.0, 0.0, {{"code", "S1"}}});

    SignalBuffer buffer(/*n_channels=*/2, /*n_samples=*/1000);
    buffer.at(0, 0) = 1.5f;
    buffer.at(1, 999) = -2.5f;

    SignalData signal(std::move(meta), std::move(buffer));

    assert(signal.isConsistent());
    assert(signal.buffer().at(0, 0) == 1.5f);
    assert(signal.buffer().at(1, 999) == -2.5f);
    assert(signal.buffer().channelData(1)[999] == -2.5f);
    assert(signal.metadata().events.size() == 1);

    std::printf("SignalData: OK (%zu canales, %zu muestras)\n",
                signal.buffer().nChannels(), signal.buffer().nSamples());

    return 0;
}
