#pragma once

#include <cstddef>
#include <string>

namespace dataminer::api {

// Arranca el servidor HTTP (bloqueante, corre ioc.run() en el hilo actual).
// data_root: raíz de datasets (.set) servidos por /api/*. processed_root:
// raíz donde /api/save escribe checkpoints (ver SignalExport.hpp). n_workers:
// tamaño del ThreadPool de cómputo, separado del hilo de red (ver
// docs/adr/004-concurrency-model.md) — import/filtrado/guardado nunca corren
// en el hilo que atiende conexiones.
void runServer(unsigned short port, const std::string& data_root, const std::string& processed_root,
               std::size_t n_workers);

} // namespace dataminer::api
