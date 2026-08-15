#pragma once

#include "core/SignalData.hpp"

#include <string>

namespace dataminer::api {

struct SaveResult {
    std::string relative_dir; // p.ej. "ds004504-sample/sub-001_task-eyesclosed_eeg"
    std::string bin_filename;
    std::string json_filename;
};

// Guarda un SignalData como checkpoint nativo de la app: buffer binario
// float32 canal-contiguo (mismo layout que la representación interna, sin
// conversión) + manifiesto JSON con metadata y la cadena de proveniencia
// completa (ADR-007).
//
// Esto NO es un exportador a un formato de intercambio científico (.set,
// CSV) — eso sigue pendiente (roadmap, Fase 11 "Exportación"). Este
// checkpoint es para guardar/inspeccionar resultados intermedios dentro de
// la propia app, no para reabrir en EEGLAB u otra herramienta.
SaveResult saveSignal(const core::SignalData& signal, const std::string& dataset_id,
                       const std::string& label, const std::string& processed_root);

} // namespace dataminer::api
