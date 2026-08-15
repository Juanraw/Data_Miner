# ADR-006: Transporte de datasets grandes

**Estado:** Aceptado — 2026-08-14

## Contexto
El demo actual envía 1 MB por WebSocket como prueba de "procesamiento". Ese patrón
no escala a datasets de EEG de varios GB (88 sujetos × millones de muestras).

## Decisión
El filesystem compartido (ADR-005) es el mecanismo **primario** de entrada de
datasets: el backend procesa archivos ya presentes en `data/raw/`, montado desde el
host. El frontend lista/selecciona archivos que el backend ya puede leer
directamente — no los recibe por red.

Subida por HTTP puede añadirse más adelante como conveniencia secundaria para casos
de un solo archivo, nunca como mecanismo principal para batch.

WebSocket se reserva para progreso/eventos del pipeline, no para mover matrices de
señal. Vistas previas para graficar viajan decimadas (ventana visible, resolución de
pantalla), nunca el dataset completo.

## Consecuencias
No hay endpoint de "subir dataset completo" en el diseño inicial de `api/`. La UI se
diseña alrededor de "seleccionar de lo ya montado", no de "arrastrar archivo".
