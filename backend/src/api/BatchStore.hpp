#pragma once

#include <map>
#include <mutex>
#include <string>
#include <vector>

namespace dataminer::api {

struct BatchItem {
    std::string dataset_id;
    std::string status = "pending"; // pending | running | done | error
    std::string filter_id;
    long long compute_time_ms = 0;
    std::string error;
};

// Sigue el progreso de un procesamiento en paralelo sobre varios datasets
// (tratamiento en masa). Cada item se actualiza desde su propio worker del
// ThreadPool; el estado combinado se consulta por polling desde el frontend.
// Sin persistencia entre reinicios ni reanudación todavía — eso es Fase 7
// del roadmap (cola de trabajos persistente); esto es paralelismo real pero
// efímero, adecuado para lotes de la sesión actual.
class BatchStore {
public:
    std::string createBatch(const std::vector<std::string>& dataset_ids);
    void updateItem(const std::string& batch_id, const BatchItem& item);
    bool getBatch(const std::string& batch_id, std::vector<BatchItem>& out) const;

private:
    mutable std::mutex mutex_;
    std::map<std::string, std::vector<BatchItem>> batches_;
    int next_id_ = 1;
};

} // namespace dataminer::api
