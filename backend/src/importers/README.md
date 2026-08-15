# importers/

Convierte archivos de entrada (`.set`/`.fdt`, `.csv`, `.txt`, futuros formatos) en la
representación interna definida en `core/`. Un importador nunca conoce el motor de
procesamiento ni el transporte de red — solo produce `SignalData`.

Sin implementar todavía. Ver `docs/adr/002-fdt-companion-files.md` y
`docs/adr/001-mat-parsing-library.md`.
