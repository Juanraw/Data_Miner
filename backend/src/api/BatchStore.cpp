#include "BatchStore.hpp"

namespace dataminer::api {

std::string BatchStore::createBatch(const std::vector<std::string>& dataset_ids) {
    std::lock_guard<std::mutex> lock(mutex_);
    std::string id = "b" + std::to_string(next_id_++);
    std::vector<BatchItem> items;
    items.reserve(dataset_ids.size());
    for (const auto& dataset_id : dataset_ids) {
        BatchItem item;
        item.dataset_id = dataset_id;
        items.push_back(std::move(item));
    }
    batches_.emplace(id, std::move(items));
    return id;
}

void BatchStore::updateItem(const std::string& batch_id, const BatchItem& item) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = batches_.find(batch_id);
    if (it == batches_.end()) return;
    for (auto& existing : it->second) {
        if (existing.dataset_id == item.dataset_id) {
            existing = item;
            return;
        }
    }
}

bool BatchStore::getBatch(const std::string& batch_id, std::vector<BatchItem>& out) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = batches_.find(batch_id);
    if (it == batches_.end()) return false;
    out = it->second;
    return true;
}

} // namespace dataminer::api
