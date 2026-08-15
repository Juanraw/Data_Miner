#pragma once

#include "algorithms/FirFilter.hpp"
#include "core/SignalData.hpp"

#include <map>
#include <mutex>
#include <string>
#include <utility>

namespace dataminer::api {

struct FilterRequest {
    std::string dataset_id;
    algorithms::FirFilterParams params;
};

struct FilterResult {
    std::string filter_id;
    long long compute_time_ms = 0;
};

// Cache en memoria de datasets importados y resultados de filtros. Sin
// persistencia ni evicción todavía — adecuado para un solo investigador con
// pocos datasets abiertos a la vez; ver docs/architecture.md y Fase 7 del
// roadmap (batch processing) para cuando esto deje de ser suficiente.
//
// Invariante de la que depende la seguridad de hilos: las entradas de
// imported_/filtered_ nunca se mutan ni se borran después de insertarse, y
// std::map garantiza que las direcciones de sus elementos son estables ante
// nuevas inserciones. Por eso es seguro devolver punteros crudos a llamadores
// que los leen fuera del lock, incluso mientras otro hilo inserta una entrada
// distinta.
class DatasetStore {
public:
    explicit DatasetStore(std::string data_root);

    // Importa (o reutiliza el resultado ya cacheado) el dataset 'id' (ruta
    // relativa a data_root). Lanza std::exception si no existe o falla la
    // importación. Devuelve el tiempo de importación en ms (0 si se sirvió
    // desde caché).
    std::pair<const core::SignalData*, long long> import(const std::string& id);

    // Aplica un filtro sobre un dataset ya importado (debe llamarse import()
    // antes). Genera un filter_id nuevo en cada llamada — no deduplica por
    // parámetros repetidos, simplicidad sobre eficiencia de caché por ahora.
    FilterResult applyFilter(const FilterRequest& request);

    const core::SignalData* getImported(const std::string& id) const;
    const core::SignalData* getFiltered(const std::string& filter_id) const;

    const std::string& dataRoot() const noexcept { return data_root_; }

private:
    std::string data_root_;
    mutable std::mutex mutex_;
    std::map<std::string, core::SignalData> imported_;
    std::map<std::string, core::SignalData> filtered_;
    int next_filter_id_ = 1;
};

} // namespace dataminer::api
