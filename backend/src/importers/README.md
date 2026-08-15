# importers/

Convierte archivos de entrada (`.set`/`.fdt`, `.csv`, `.txt`, futuros formatos) en la
representación interna definida en `core/`. Un importador nunca conoce el motor de
procesamiento ni el transporte de red — solo produce `SignalData`.

`SetImporter` (`.set`/`.fdt` vía libmatio) implementado — ver
`docs/adr/002-fdt-companion-files.md` y `docs/adr/001-mat-parsing-library.md`.
Cubre: EEG.data inline o referenciando `.fdt` externo, chanlocs (labels +
posición si existe), eventos (type/latency/duration + campos extra), continuo
y epocado. Validado contra datos reales de OpenNeuro ds004504 y con un
round-trip sintético para la ruta `.fdt` (ver `backend/tests/`).

Sin implementar: `.csv`/`.txt` (siguen en el roadmap), detección automática
de formato por extensión/contenido (hoy se invoca `importSet()` directamente).
