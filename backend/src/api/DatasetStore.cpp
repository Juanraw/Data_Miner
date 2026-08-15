#include "DatasetStore.hpp"

#include "importers/SetImporter.hpp"

#include <chrono>
#include <filesystem>
#include <stdexcept>

namespace dataminer::api {

namespace fs = std::filesystem;

DatasetStore::DatasetStore(std::string data_root) : data_root_(std::move(data_root)) {}

std::pair<const core::SignalData*, long long> DatasetStore::import(const std::string& id) {
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = imported_.find(id);
        if (it != imported_.end()) {
            return {&it->second, 0};
        }
    }

    // No permitir que 'id' escape de data_root_ (p.ej. "../../etc/passwd").
    fs::path canonical_root = fs::weakly_canonical(fs::path(data_root_));
    fs::path canonical_target = fs::weakly_canonical(canonical_root / id);
    fs::path rel = fs::relative(canonical_target, canonical_root);
    if (rel.empty() || rel.native().rfind("..", 0) == 0) {
        throw std::invalid_argument("id de dataset inválido: " + id);
    }

    auto start = std::chrono::steady_clock::now();
    core::SignalData signal = importers::importSet(canonical_target.string());
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now() - start)
                          .count();

    std::lock_guard<std::mutex> lock(mutex_);
    auto [inserted_it, inserted] = imported_.emplace(id, std::move(signal));
    return {&inserted_it->second, elapsed_ms};
}

FilterResult DatasetStore::applyFilter(const FilterRequest& request) {
    const core::SignalData* input = nullptr;
    {
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = imported_.find(request.dataset_id);
        if (it == imported_.end()) {
            throw std::invalid_argument("dataset no importado todavía: " + request.dataset_id);
        }
        input = &it->second;
    }

    auto start = std::chrono::steady_clock::now();
    core::SignalData result = algorithms::applyFirFilter(*input, request.params);
    auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::steady_clock::now() - start)
                          .count();

    std::lock_guard<std::mutex> lock(mutex_);
    std::string filter_id = "f" + std::to_string(next_filter_id_++);
    filtered_.emplace(filter_id, std::move(result));
    return FilterResult{filter_id, elapsed_ms};
}

const core::SignalData* DatasetStore::getImported(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = imported_.find(id);
    return it != imported_.end() ? &it->second : nullptr;
}

const core::SignalData* DatasetStore::getFiltered(const std::string& filter_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = filtered_.find(filter_id);
    return it != filtered_.end() ? &it->second : nullptr;
}

} // namespace dataminer::api
