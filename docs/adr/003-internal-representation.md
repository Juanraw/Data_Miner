# ADR-003: Representación interna de la señal

**Estado:** Aceptado — 2026-08-14

## Contexto
La representación interna (`SignalData`) es el contrato entre importadores,
algoritmos y motor de pipeline. Cambiarla después de que exista el motor de
procesamiento es costoso.

## Decisión
- **Layout de memoria:** canal-contiguo (cada canal es un bloque contiguo de
  muestras). Es cache-friendly para filtrado secuencial por canal y coincide con
  cómo EEGLAB ya escribe `.fdt`.
- **Precisión:** float32 por defecto (coincide con la precisión nativa de `.fdt`,
  mitad de RAM que float64). Los algoritmos que lo requieran (ej. descomposiciones
  propias en ICA/ASR) suben a float64 internamente como detalle de implementación,
  no como formato de almacenamiento general.
- **Separación metadata/buffer:** metadata (srate, canales, eventos, epochs,
  referencia, sujeto/sesión, proveniencia) vive en una estructura ligera separada del
  buffer de datos, siempre en memoria incluso cuando el buffer se transfiere o se
  libera.
- **DEBE conservarse:** srate, dimensiones, nombres de canales, eventos con latencia
  exacta, referencia usada, proveniencia completa de pipeline.
- **DEBERÍA conservarse:** posiciones de electrodos, `EEG.history` de MATLAB como
  texto libre.
- **PUEDE descartarse:** campos específicos de la GUI de EEGLAB sin significado fuera
  de MATLAB (a identificar durante la implementación del importador).

## Consecuencias
Todo importador (`.set`, `.csv`, `.txt`, futuros formatos) debe converger a esta
misma estructura. El motor de procesamiento nunca ve el formato original.
