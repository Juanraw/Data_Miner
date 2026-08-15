# ADR-002: Manejo de archivos .fdt asociados

**Estado:** Aceptado — 2026-08-14

## Contexto
EEGLAB puede guardar un `.set` sin los datos inline: el campo `EEG.data` queda como
una cadena de texto con el nombre de un archivo `.fdt` (float32 plano) que vive junto
al `.set`. No todos los `.set` tienen esta forma — depende de cómo se guardó el
dataset original. El importador no puede asumir ninguno de los dos casos.

## Decisión
El importador de `.set`:
1. Parsea el `.mat` primero (vía libmatio, ADR-001).
2. Inspecciona el tipo del campo `data`: numérico → datos inline; texto → nombre de
   archivo `.fdt`.
3. Si es `.fdt`, resuelve la ruta **relativa al directorio del `.set`**, nunca a una
   ruta absoluta que pudiera venir embebida en el `.mat` (esas rutas suelen
   corresponder a la máquina donde se guardó originalmente y no son de fiar).
4. Si el `.fdt` referenciado no existe junto al `.set`, la importación falla de forma
   explícita (error claro, no un dataset vacío o corrupto silencioso).
5. El `.fdt` se lee completo a memoria (no mmap) en la implementación inicial —
   correcto primero, optimizar después si un dataset real lo exige (ver §13 de la
   auditoría). mmap queda como optimización futura, no bloqueante.

## Consecuencias
El importador de `.set` es, en la práctica, dos importadores condicionales sobre el
mismo formato lógico. Los tests de importación deben cubrir explícitamente ambos
casos (inline y con `.fdt` asociado) con datasets de referencia reales.

## Addendum — 2026-08-14, tras implementación y validación contra OpenNeuro ds004504
Hallazgo empírico no anticipado en la decisión original: EEGLAB guarda `.set` con
`save(filename, '-mat', '-struct', 'EEG', ...)` — el flag `-struct` hace que MATLAB
**aplane** el struct `EEG` en variables de nivel superior individuales dentro del
`.mat` (`nbchan`, `srate`, `data`, `chanlocs`, `event`, ...), **no** una única
variable struct `EEG` anidada como se asumió inicialmente. El importador lee cada
campo con `Mat_VarRead(mat, "nombre_campo")` directamente, no vía
`Mat_VarGetStructFieldByName` sobre un struct padre. Confirmado contra los 88
sujetos de OpenNeuro ds004504 (ninguno usa `.fdt` externo — todos autocontenidos;
la ruta `.fdt` se validó por separado con un fixture sintético, ver
`backend/tests/set_importer_fdt_roundtrip_test.cpp`). Si en el futuro aparece un
`.set` con la forma anidada, el importador deberá extenderse para detectar y
soportar ambas — hoy solo soporta la forma aplanada, que es la que se observó.
