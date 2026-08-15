# algorithms/

Funciones puras de procesamiento de señal (filtros, rereferenciación, ASR, ICA, bandas
de frecuencia). Reciben y devuelven `SignalData` (o vistas sobre sus buffers). Sin I/O,
sin red, sin dependencias de `api/` ni `executor/` — deben poder probarse invocándolas
directamente desde un test, sin levantar el servidor.

Implementación propia obligatoria: no se permiten dependencias de terceros que
resuelvan directamente el algoritmo científico (ver auditoría, sección 10).

Sin implementar todavía.
