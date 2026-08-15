# ADR-001: Librería de parsing de contenedores .mat

**Estado:** Aceptado — 2026-08-14

## Contexto
`.set` es un contenedor MATLAB (MAT v5 o v7.3/HDF5). No hay soporte nativo en C++
para deserializarlo. El proyecto prohíbe depender de librerías que resuelvan
directamente algoritmos científicos (filtros, ICA, ASR), pero permite librerías de
infraestructura (networking, serialización, UI).

## Decisión
Usar **libmatio** (C, LGPL) para leer los contenedores `.mat` que forman los `.set`.
Se clasifica como infraestructura de serialización: deserializa una estructura de
bytes documentada, no interpreta ni transforma la señal. Debe soportar tanto MAT v5
clásico como v7.3 (HDF5) — el importador detecta la variante desde la cabecera del
archivo antes de elegir el camino de parsing.

## Alternativas descartadas
- Reimplementar el parser MAT5 a mano: reinventa infraestructura sin aportar valor
  científico; alto riesgo de bugs sutiles en un formato binario ya resuelto.
- Depender de MATLAB Runtime: requiere licencia, contradice el objetivo de
  portabilidad/reproducibilidad en Docker.

## Consecuencias
El backend gana una dependencia nueva de infraestructura (libmatio + su dependencia
de HDF5 para v7.3). Debe fijarse su versión en el Dockerfile para reproducibilidad.
