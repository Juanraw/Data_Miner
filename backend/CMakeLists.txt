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

find_package(PkgConfig REQUIRED)
pkg_check_modules(MATIO REQUIRED IMPORTED_TARGET matio)

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

add_executable(backend src/main.cpp)
target_link_libraries(backend ${Boost_LIBRARIES} core)

enable_testing()

add_executable(core_smoke_test tests/core_smoke_test.cpp)
target_link_libraries(core_smoke_test core)
add_test(NAME core_smoke_test COMMAND core_smoke_test)

# Round-trip sintetico (sin datos externos): valida la ruta EEG.data -> .fdt
# externo, que ningun dataset real disponible en esta sesion ejercita.
add_executable(set_importer_fdt_roundtrip_test tests/set_importer_fdt_roundtrip_test.cpp)
target_link_libraries(set_importer_fdt_roundtrip_test importers)
add_test(NAME set_importer_fdt_roundtrip_test COMMAND set_importer_fdt_roundtrip_test)

# Herramienta manual de verificacion contra datos reales (ver el propio
# archivo): no se registra con add_test porque requiere un dataset montado
# en runtime, no disponible durante el build de la imagen.
add_executable(set_importer_real_test tests/set_importer_real_test.cpp)
target_link_libraries(set_importer_real_test importers)