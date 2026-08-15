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
(el campo `data` es numérico en el primer caso, texto en el segundo). El
importador debe manejar ambos casos explícitamente — ver `docs/adr/002-*.md`.

**Importante:** EEGLAB guarda `.set` con `save(..., '-struct', 'EEG')`, que APLANA
el struct EEG en variables de nivel superior individuales (`nbchan`, `srate`,
`data`, `chanlocs`, `event`, ...) — no hay una variable struct `EEG` anidada.
Confirmado empíricamente contra datos reales; ver addendum en
`docs/adr/002-fdt-companion-files.md`.

## Estado (2026-08-14)
Fase -1/0 y Fase 1 completadas (ver commits previos). Fase 2 completada:
`backend/src/importers/SetImporter.{hpp,cpp}` importa `.set` reales a `SignalData`
— srate, canales (chanlocs), eventos (type/latency/duration + campos extra),
continuo/epocado, y ambas rutas de `data` (inline y `.fdt` externo). Validado
contra 2 sujetos reales de OpenNeuro ds004504 (19 canales, 500 Hz, ~10 min cada
uno) y con un round-trip sintético para la ruta `.fdt` que ningún sujeto de ese
dataset ejercita (todos autocontenidos). `backend/src/main.cpp` sigue siendo el
demo de eco HTTP/WS original, a reemplazar — no la base del `api/` final (ver
`docs/architecture.md`). Próximo paso: Fase 3, processing engine headless
(desacoplado del transporte, ver ADR-004) + primer algoritmo real (filtros).

## Qué NO hacer sin decisión explícita
- No añadir dependencias de terceros que resuelvan directamente algoritmos
  científicos (filtros, ICA, ASR, rereferenciación).
- No enviar matrices de señal completas por WebSocket.
- No acoplar `algorithms/` ni `core/` a Boost.Beast/Asio.
