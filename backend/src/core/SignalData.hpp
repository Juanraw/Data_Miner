#pragma once

#include "SignalBuffer.hpp"

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace dataminer::core {

struct ChannelInfo {
    std::string label;
    std::string unit; // ej. "uV"
    std::optional<double> pos_x;
    std::optional<double> pos_y;
    std::optional<double> pos_z;
};

// Evento discreto (equivalente a EEG.event de EEGLAB). latency_samples puede
// ser fraccional. extra_fields conserva campos definidos libremente por el
// usuario que EEGLAB permite añadir al struct de eventos — no se descartan
// por no tener un campo dedicado (ver docs/adr/003-internal-representation.md).
struct Event {
    std::string type;
    double latency_samples = 0.0;
    double duration_samples = 0.0;
    std::map<std::string, std::string> extra_fields;
};

struct EpochInfo {
    std::size_t n_epochs = 0;
    std::size_t samples_per_epoch = 0;
    double epoch_start_seconds = 0.0; // EEG.xmin
    double epoch_end_seconds = 0.0;   // EEG.xmax
};

// Un paso de pipeline ya ejecutado sobre este dataset. Ver
// docs/adr/007-provenance-manifest.md para el formato de exportación.
struct ProvenanceStage {
    std::string stage_name;
    std::string algorithm_version;
    std::map<std::string, std::string> params;
    std::string started_at;
    std::string finished_at;
};

struct SignalMetadata {
    double sampling_rate_hz = 0.0;
    std::vector<ChannelInfo> channels;
    std::vector<Event> events;
    std::optional<EpochInfo> epochs; // ausente si el dataset es continuo

    std::string reference;
    std::string subject_id;
    std::string session_id;
    std::string condition;

    std::vector<ProvenanceStage> provenance;

    // Identidad del archivo original, para reproducibilidad (ADR-007).
    std::string source_path;
    std::string source_sha256;
};

// Representación interna de una señal biomédica: metadata + buffer
// canal-contiguo float32. Producida por un importador (../importers/),
// consumida por algoritmos (../algorithms/) y por el motor de pipeline.
// No depende de red ni UI (ver docs/architecture.md).
class SignalData {
public:
    SignalData(SignalMetadata metadata, SignalBuffer buffer);

    const SignalMetadata& metadata() const noexcept { return metadata_; }
    SignalMetadata& metadata() noexcept { return metadata_; }

    const SignalBuffer& buffer() const noexcept { return buffer_; }
    SignalBuffer& buffer() noexcept { return buffer_; }

    // Verifica consistencia interna (dimensiones de buffer vs metadata,
    // epochs vs n_samples, eventos con latencia válida). No valida contra el
    // archivo original — eso es responsabilidad de los tests de importación.
    bool isConsistent() const;

private:
    SignalMetadata metadata_;
    SignalBuffer buffer_;
};

} // namespace dataminer::core
