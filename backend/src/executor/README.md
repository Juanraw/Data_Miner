# executor/

Cola de trabajos y pool de workers para procesamiento batch (múltiples sujetos).
Vive en un dominio de concurrencia separado del `io_context` de red — un cómputo
largo aquí nunca debe bloquear la capa de API. Persiste estado por sujeto para
permitir reanudación tras fallos parciales.
Ver `docs/adr/004-concurrency-model.md`.

`ThreadPool` implementado (workers fijos + cola de tareas + futures);
validado con test de correctitud y de concurrencia real (ver
`backend/tests/threadpool_test.cpp`). Usado por `filter_real_test` para
correr import + filtro fuera del hilo principal, probando en código la
separación de ADR-004.

Sin implementar: cola de trabajos por sujeto, estado persistido, reanudación
(eso es Fase 7, procesamiento batch — ver `docs/architecture.md`).
