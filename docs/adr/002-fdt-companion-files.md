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
5. El `.fdt` se mapea en memoria (mmap) en lugar de cargarse completo cuando el
   tamaño lo justifique (ver ADR-003 sobre representación interna).

## Consecuencias
El importador de `.set` es, en la práctica, dos importadores condicionales sobre el
mismo formato lógico. Los tests de importación deben cubrir explícitamente ambos
casos (inline y con `.fdt` asociado) con datasets de referencia reales.
