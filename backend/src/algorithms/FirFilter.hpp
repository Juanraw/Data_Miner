#pragma once

#include "core/SignalData.hpp"

#include <cstddef>
#include <vector>

namespace dataminer::algorithms {

enum class FilterType { LowPass, HighPass, BandPass };

struct FirFilterParams {
    FilterType type = FilterType::LowPass;
    double low_hz = 0.0;  // usado en HighPass (corte) y BandPass (borde inferior)
    double high_hz = 0.0; // usado en LowPass (corte) y BandPass (borde superior)
    std::size_t n_taps = 101; // debe ser impar (fase lineal simétrica)
};

// Filtro FIR de fase lineal (ventana de Hamming sobre sinc ideal, diseño e
// implementación propios — ver docs/architecture.md: sin librerías de
// terceros para algoritmos científicos). Función pura: no muta 'input', no
// hace I/O. Devuelve un SignalData nuevo con una etapa añadida a
// metadata().provenance (ADR-007).
core::SignalData applyFirFilter(const core::SignalData& input, const FirFilterParams& params);

// Expuesto para testing/inspección: coeficientes del kernel ya normalizado.
std::vector<double> designFirKernel(const FirFilterParams& params, double sampling_rate_hz);

} // namespace dataminer::algorithms
