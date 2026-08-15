cmake_minimum_required(VERSION 3.15)
project(BackendApp)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Sin esto, CMake compila sin flags de optimización (-O0 de facto), lo cual
# contradice la prioridad de velocidad de cómputo del proyecto.
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(Boost 1.70 REQUIRED COMPONENTS system)
find_package(Threads REQUIRED)

find_package(PkgConfig REQUIRED)
pkg_check_modules(MATIO REQUIRED IMPORTED_TARGET matio)

# Infraestructura de serialización para la API (no procesamiento científico).
find_package(nlohmann_json REQUIRED)

# Núcleo científico: sin dependencias de Boost.Beast/Asio ni de red (ver
# docs/architecture.md). libmatio es infraestructura de serialización
# (ADR-001), no un algoritmo científico.
add_library(core STATIC
    src/core/SignalBuffer.cpp
    src/core/SignalData.cpp
)
target_include_directories(core PUBLIC src)
target_link_libraries(core PUBLIC PkgConfig::MATIO)

# Importador .set/.fdt (Fase 2, ADR-002): depende de core y de libmatio para
# parsear el struct EEG, pero de nada de red/UI.
add_library(importers STATIC
    src/importers/SetImporter.cpp
)
target_include_directories(importers PUBLIC src)
target_link_libraries(importers PUBLIC core PkgConfig::MATIO)

# Primer algoritmo real (Fase 3, filtro FIR propio — ver docs/architecture.md
# sobre no depender de librerías científicas de terceros). Función pura sobre
# core/, sin red ni UI.
add_library(algorithms STATIC
    src/algorithms/FirFilter.cpp
)
target_include_directories(algorithms PUBLIC src)
target_link_libraries(algorithms PUBLIC core)

# Dominio de cómputo separado del dominio de red (ADR-004): no depende de
# core/algorithms/importers, solo ejecuta callables.
add_library(executor STATIC
    src/executor/ThreadPool.cpp
)
target_include_directories(executor PUBLIC src)
target_link_libraries(executor PUBLIC Threads::Threads)

# Capa de transporte (Fase 4): traduce HTTP/JSON a llamadas sobre
# importers/algorithms/executor. No contiene lógica científica — ver
# docs/architecture.md sobre la regla de dependencia api/ -> resto, nunca al
# revés.
add_library(api STATIC
    src/api/BatchStore.cpp
    src/api/DatasetCatalog.cpp
    src/api/DatasetStore.cpp
    src/api/JsonSerialization.cpp
    src/api/Preview.cpp
    src/api/SignalExport.cpp
    src/api/HttpServer.cpp
)
target_include_directories(api PUBLIC src)
target_link_libraries(api PUBLIC importers algorithms executor
    ${Boost_LIBRARIES} nlohmann_json::nlohmann_json)

add_executable(backend src/main.cpp)
target_link_libraries(backend api)

enable_testing()

add_executable(core_smoke_test tests/core_smoke_test.cpp)
target_link_libraries(core_smoke_test core)
add_test(NAME core_smoke_test COMMAND core_smoke_test)

# Round-trip sintetico (sin datos externos): valida la ruta EEG.data -> .fdt
# externo, que ningun dataset real disponible en esta sesion ejercita.
add_executable(set_importer_fdt_roundtrip_test tests/set_importer_fdt_roundtrip_test.cpp)
target_link_libraries(set_importer_fdt_roundtrip_test importers)
add_test(NAME set_importer_fdt_roundtrip_test COMMAND set_importer_fdt_roundtrip_test)

add_executable(fir_filter_synthetic_test tests/fir_filter_synthetic_test.cpp)
target_link_libraries(fir_filter_synthetic_test algorithms)
add_test(NAME fir_filter_synthetic_test COMMAND fir_filter_synthetic_test)

add_executable(threadpool_test tests/threadpool_test.cpp)
target_link_libraries(threadpool_test executor)
add_test(NAME threadpool_test COMMAND threadpool_test)

# Herramientas manuales de verificacion contra datos reales (ver cada
# archivo): no se registran con add_test porque requieren un dataset montado
# en runtime, no disponible durante el build de la imagen.
add_executable(set_importer_real_test tests/set_importer_real_test.cpp)
target_link_libraries(set_importer_real_test importers)

add_executable(filter_real_test tests/filter_real_test.cpp)
target_link_libraries(filter_real_test importers algorithms executor)