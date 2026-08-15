# algorithms/

Funciones puras de procesamiento de señal (filtros, rereferenciación, ASR, ICA, bandas
de frecuencia). Reciben y devuelven `SignalData` (o vistas sobre sus buffers). Sin I/O,
sin red, sin dependencias de `api/` ni `executor/` — deben poder probarse invocándolas
directamente desde un test, sin levantar el servidor.

Implementación propia obligatoria: no se permiten dependencias de terceros que
resuelvan directamente el algoritmo científico (ver auditoría, sección 10).

`FirFilter` implementado: pasa-bajos/pasa-altos/pasa-banda de fase lineal
(sinc ideal + ventana de Hamming, diseño e implementación propios). Validado
con tonos sintéticos de frecuencia conocida (medición espectral directa, sin
librerías externas) y contra datos reales vía `filter_real_test`.

Sin implementar: rereferenciación, ASR, ICA, bandas de frecuencia con nombre
(delta/theta/alpha/...).
