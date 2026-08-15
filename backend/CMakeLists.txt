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

add_executable(backend src/main.cpp)
target_link_libraries(backend ${Boost_LIBRARIES})