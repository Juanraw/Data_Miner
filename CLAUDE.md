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
Fases -1/0, 1 y 2 completadas (ver commits previos: estructura+ADRs, modelo de
datos interno, importador `.set`/`.fdt`). Fase 3 completada:
- `backend/src/algorithms/FirFilter.{hpp,cpp}`: filtro FIR de fase lineal propio
  (sinc + ventana Hamming; lowpass/highpass/bandpass por inversión/resta
  espectral), con extensión por reflexión en los bordes (evita transitorios al
  filtrar señales con offset DC). Validado con tonos sintéticos de frecuencia
  conocida (medición espectral directa) y contra datos reales.
- `backend/src/executor/ThreadPool.{hpp,cpp}`: pool de workers separado del
  dominio de red (ADR-004), validado con test de correctitud y de concurrencia
  real (4 tareas de 100ms en ~100ms con 4 workers).
- `filter_real_test`: import + filtro corriendo en un worker del pool sobre un
  sujeto real de OpenNeuro ds004504 — prueba end-to-end del núcleo científico
  headless, sin `api/` ni frontend.

Fase 4 completada: `backend/src/main.cpp` ya no es el demo de eco — `api/`
reemplaza el servidor original con routing real sobre Boost.Beast:
- `GET /api/datasets`, `GET /api/import`, `GET /api/preview`,
  `POST /api/filter`, `POST /api/batch-filter` + `GET /api/batch` (tratamiento
  en masa, cada dataset en su propio worker del pool — paralelismo real,
  verificado con 2 sujetos reales corriendo simultáneamente), `POST /api/save`
  (checkpoint nativo `.bin` + manifiesto `.json` con proveniencia completa en
  `data/processed/`, ver `SignalExport.hpp` — **no** es un exportador a `.set`,
  eso sigue pendiente).
- `DatasetStore`/`BatchStore`: caché en memoria, sin persistencia entre
  reinicios (Fase 7 para eso).
- Frontend reescrito por completo (ya no es la plantilla de Vite): múltiples
  paneles de vista simultáneos (comparar canales del mismo sujeto o sujetos
  distintos), zoom/pan/home con viewport compartido en segundos, flags (marcar
  un punto de interés que se mantiene alineado entre señal original y
  filtrada, ya que el filtro preserva 1:1 el índice de muestra), selección de
  datasets con checkboxes para lote. Canvas con paleta validada por
  accesibilidad (ver skill de dataviz).

Verificado por API con datos reales (import, preview, filtro, lote paralelo,
guardado con tamaño de archivo exacto) y compilación TypeScript limpia. **No
verificado visualmente en navegador** — la verificación automatizada con
Chromium headless (Playwright) choca con una incompatibilidad específica
entre el runtime Bun y el transporte WebSocket interno de playwright-core
(un WebSocket nativo sí conecta; el de playwright-core no, incluso apuntando
a 127.0.0.1 explícitamente). Pendiente: o bien instalar Node.js para probar
ese pipeline, o verificación manual abriendo `localhost:8090`.

Fixes tras uso real reportado por el usuario:
- `WaveformPanel` medía su canvas con un ancho fijo (820px) en vez del ancho
  real del contenedor — con 2+ vistas lado a lado la señal se salía del
  recuadro. Ahora usa `ResizeObserver` sobre el wrapper (+ `min-width: 0` en
  `.view-panel`, la causa clásica de que un grid item no se achique cuando su
  hijo mide su propio tamaño).
- Zoom por selección (arrastrar sobre la señal, estilo lupa) además de los
  botones +/−, vía `onZoomSelect` en `WaveformPanel`.
- Quitar un flag individual: clic cerca de un flag existente (con flags
  activos) lo quita en vez de agregar uno nuevo encima; también hay un panel
  "Flags" en el sidebar con lista + botón de quitar por cada uno.
- El viewport (zoom/pan/home) dejó de ser global y ahora vive en
  `PanelState.viewport`, independiente por vista — cada panel tiene su propia
  mini barra de zoom. Esto también resolvió de raíz un bug real: con viewport
  compartido, hacer zoom en un sujeto largo y luego ver uno más corto en otra
  vista pedía un rango fuera del alcance de ese dataset y la vista quedaba en
  blanco sin explicación (reproducido con curl antes del fix). El backend
  (`Preview.cpp`) también recorta `start_sample` ahora, no solo `end_sample`,
  como defensa adicional.

Próximo paso: Fase 6/7 — pipeline engine con proveniencia encadenada, o
batch processing con estado persistido/reanudación.

## Qué NO hacer sin decisión explícita
- No añadir dependencias de terceros que resuelvan directamente algoritmos
  científicos (filtros, ICA, ASR, rereferenciación).
- No enviar matrices de señal completas por WebSocket.
- No acoplar `algorithms/` ni `core/` a Boost.Beast/Asio.
