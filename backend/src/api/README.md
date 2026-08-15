# api/

Capa de transporte HTTP (Boost.Beast) implementada — reemplaza el demo
original de `backend/src/main.cpp`. Traduce requests a llamadas sobre
`importers/`, `algorithms/` y `executor/`; no contiene lógica científica.
HTTP para todo (control, metadata, import/filtro/lote/guardado) — WebSocket
para progreso/eventos sigue sin implementarse (ver ADR-006 y roadmap Fase 7),
por ahora el progreso de lotes se consulta por polling (`GET /api/batch`).

- `HttpServer`: routing hecho a mano + dispatch de trabajo pesado al
  `ThreadPool` (import/filtro/guardado nunca bloquean el hilo de red, ADR-004).
- `DatasetStore`: caché en memoria de datasets importados y resultados
  filtrados.
- `BatchStore`: progreso de un tratamiento en masa (paralelo real vía el pool).
- `Preview`: decimación min/max — el navegador nunca recibe la matriz completa.
- `SignalExport`: checkpoint nativo (`.bin` + manifiesto `.json` con
  proveniencia) en `data/processed/`. No es un exportador a `.set`/CSV.
- `JsonSerialization`: `core::SignalData` → JSON de la API (vía nlohmann-json,
  infraestructura de serialización, no ciencia).
