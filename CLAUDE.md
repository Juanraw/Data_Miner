# Data_Miner

Plataforma de procesamiento y análisis de señales biomédicas (EEG/EMG/ECG) para
investigación doctoral. Prioridades, en orden: velocidad de cómputo, eficiencia de
memoria, reproducibilidad, trazabilidad científica, escalabilidad, modularidad.

## Stack
- **Backend:** C++17, Boost.Beast/Asio (networking), CMake. Sin librerías de
  terceros para algoritmos científicos (filtros, ICA, ASR) — implementación propia
  obligatoria. `.mat`/`.set` vía libmatio (infraestructura de serialización, no
  ciencia — ver `docs/adr/001-mat-parsing-library.md`).
- **Frontend:** React 19 + Vite + TypeScript, gestionado con Bun.
- **Despliegue:** Docker multi-stage (`Dockerfile`, `docker-compose.yml`).

## Comandos
```bash
# Frontend
cd frontend && bun install && bun run dev      # desarrollo
cd frontend && bun run build                    # build de producción

# Backend
mkdir -p build && cd build && cmake -DCMAKE_BUILD_TYPE=Release ../backend && make

# Todo junto (imagen final sirve frontend build + backend en :8090)
docker compose up --build
```

## Regla arquitectónica central
El núcleo científico (`backend/src/{importers,algorithms,core,executor}/`) debe
poder probarse sin levantar `api/` (HTTP/WS) ni el frontend — nada de I/O de red
dentro de `algorithms/`. Ver `docs/architecture.md` para el diagrama completo y
`docs/adr/` para las decisiones bloqueantes ya resueltas (parsing `.mat`/`.fdt`,
representación interna, modelo de concurrencia, persistencia, transporte de
datasets grandes, manifiesto de proveniencia).

## Datasets grandes: filesystem, no red
`.set`/`.fdt` y otros datasets viven en `data/raw/` (montado por Docker, ignorado
por git). El backend los lee directamente del disco; no se suben por WebSocket ni
se envían matrices completas al navegador (ADR-006). Resultados y manifiestos de
proveniencia van a `data/processed/` y `data/logs/`.

## Formato .set — soporte obligatorio, no opcional
`.set` puede ser autocontenido o referenciar un `.fdt` externo con los datos reales
(el campo `EEG.data` es numérico en el primer caso, texto en el segundo). El
importador debe manejar ambos casos explícitamente — ver `docs/adr/002-*.md`.

## Estado (2026-08-14)
Fase -1/0 completada: estructura de carpetas, ADRs, flags de build. Nada del núcleo
científico está implementado todavía — `backend/src/main.cpp` es un demo de eco
HTTP/WS a reemplazar, no la base del `api/` final (ver `docs/architecture.md`).
Próximo paso: Fase 1, modelo de datos interno + integración de libmatio.

## Qué NO hacer sin decisión explícita
- No añadir dependencias de terceros que resuelvan directamente algoritmos
  científicos (filtros, ICA, ASR, rereferenciación).
- No enviar matrices de señal completas por WebSocket.
- No acoplar `algorithms/` ni `core/` a Boost.Beast/Asio.
