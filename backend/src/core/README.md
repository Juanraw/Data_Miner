# core/

Representación interna de datos (`SignalData`: metadata + buffer canal-contiguo
float32) y el modelo de proveniencia/pipeline (etapas, parámetros, versiones).
Ver `docs/adr/003-internal-representation.md` y `docs/adr/007-provenance-manifest.md`.

`SignalBuffer` (buffer canal-contiguo float32) y `SignalData`/`SignalMetadata`
(canales, eventos, epochs, proveniencia) implementados — ver `SignalBuffer.hpp`
y `SignalData.hpp`. Sin importadores todavía (Fase 2): nada aquí sabe leer
`.set`/`.fdt`, solo define la estructura que un importador debe producir.
