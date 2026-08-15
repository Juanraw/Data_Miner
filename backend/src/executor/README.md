# executor/

Cola de trabajos y pool de workers para procesamiento batch (múltiples sujetos).
Vive en un dominio de concurrencia separado del `io_context` de red — un cómputo
largo aquí nunca debe bloquear la capa de API. Persiste estado por sujeto para
permitir reanudación tras fallos parciales.
Ver `docs/adr/004-concurrency-model.md`.

Sin implementar todavía.
