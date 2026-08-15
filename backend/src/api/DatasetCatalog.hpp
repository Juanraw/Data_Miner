#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace dataminer::api {

struct DatasetEntry {
    std::string id;   // ruta relativa a data_root, identificador estable en la API
    std::string name; // nombre de archivo
    std::uintmax_t size_bytes = 0;
};

// Escanea data_root recursivamente en busca de archivos .set. Solo lista lo
// disponible en el filesystem compartido — no importa nada (ver
// docs/adr/006-large-dataset-transfer.md).
std::vector<DatasetEntry> listDatasets(const std::string& data_root);

} // namespace dataminer::api
