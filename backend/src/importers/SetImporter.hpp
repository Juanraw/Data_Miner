#pragma once

#include "core/SignalData.hpp"

#include <stdexcept>
#include <string>

namespace dataminer::importers {

// Error de importación: archivo ausente, estructura EEG inesperada, .fdt
// referenciado que no aparece junto al .set, dimensiones inconsistentes, etc.
// Ver docs/adr/002-fdt-companion-files.md — la regla es fallar de forma
// explícita, nunca producir un SignalData vacío o silenciosamente incorrecto.
class SetImportError : public std::runtime_error {
public:
    explicit SetImportError(const std::string& message) : std::runtime_error(message) {}
};

// Importa un dataset EEGLAB .set (MAT5) a la representación interna.
// Maneja tanto el caso autocontenido (EEG.data numérico, inline) como el caso
// con datos externos (EEG.data es un nombre de archivo .fdt, resuelto relativo
// al directorio de set_path) — ver ADR-002.
core::SignalData importSet(const std::string& set_path);

} // namespace dataminer::importers
