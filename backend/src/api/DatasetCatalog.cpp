#include "DatasetCatalog.hpp"

#include <algorithm>
#include <filesystem>

namespace dataminer::api {

namespace fs = std::filesystem;

std::vector<DatasetEntry> listDatasets(const std::string& data_root) {
    std::vector<DatasetEntry> result;
    if (!fs::exists(data_root)) {
        return result;
    }

    for (const auto& entry : fs::recursive_directory_iterator(data_root)) {
        if (!entry.is_regular_file()) continue;
        if (entry.path().extension() != ".set") continue;

        DatasetEntry d;
        d.id = fs::relative(entry.path(), data_root).generic_string();
        d.name = entry.path().filename().string();
        d.size_bytes = entry.file_size();
        result.push_back(std::move(d));
    }

    std::sort(result.begin(), result.end(),
              [](const DatasetEntry& a, const DatasetEntry& b) { return a.id < b.id; });
    return result;
}

} // namespace dataminer::api
