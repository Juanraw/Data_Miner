# ------------------------------------------------------------
# ETAPA 1: Construir el Frontend (TypeScript) con Bun
# ------------------------------------------------------------
FROM oven/bun:1.3.14 AS builder-frontend

WORKDIR /app
COPY frontend/ ./frontend/

# Instalar dependencias y construir
RUN cd frontend && bun install && bun run build

# ------------------------------------------------------------
# ETAPA 2: Construir el Backend (C++)
# ------------------------------------------------------------
FROM ubuntu:22.04 AS builder-backend

# Instalar herramientas de compilación
RUN apt-get update && apt-get install -y \
    git cmake g++ pkg-config libboost-all-dev libmatio-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/ ./backend

# Compilar el C++ (Release explícito: sin esto CMake no optimiza)
RUN mkdir -p build && cd build && \
    cmake -DCMAKE_BUILD_TYPE=Release ../backend && \
    make

# Tests automáticos sin datos externos (ver backend/tests/): modelo de datos +
# enlace con libmatio (ADR-001), round-trip sintético .set/.fdt (ADR-002),
# filtro FIR contra tonos de frecuencia conocida, y concurrencia real del
# ThreadPool (ADR-004). Si alguno falla, el build se detiene aquí en vez de
# producir una imagen rota. set_importer_real_test y filter_real_test no
# corren aquí — necesitan un dataset real montado en runtime (ver esos archivos).
RUN cd build && \
    ./core_smoke_test && \
    ./set_importer_fdt_roundtrip_test && \
    ./fir_filter_synthetic_test && \
    ./threadpool_test

# ------------------------------------------------------------
# ETAPA 3: Imagen FINAL (solo lo necesario para ejecutar)
# ------------------------------------------------------------
FROM ubuntu:22.04

# Instalar solo las librerías necesarias para correr (no las de compilación)
RUN apt-get update && apt-get install -y \
    libboost-all-dev libmatio11 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar el ejecutable de C++ desde la etapa 2
COPY --from=builder-backend /app/build/backend /app/backend

# Copiar los archivos estáticos del frontend desde la etapa 1
COPY --from=builder-frontend /app/frontend/dist /app/public

# Exponer el puerto donde escuchará el servidor
EXPOSE 8090

# Comando para arrancar la aplicación
CMD ["./backend"]