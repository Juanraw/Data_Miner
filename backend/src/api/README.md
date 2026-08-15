# api/

Capa delgada HTTP/WebSocket (Boost.Beast). Traduce requests a llamadas al
`executor/`; no contiene lógica científica ni conoce los algoritmos directamente.
HTTP para control/metadata/consulta de estado, WebSocket para progreso/eventos.
Ver `docs/adr/006-large-dataset-transfer.md`.

Hoy contiene únicamente el demo original en `backend/src/main.cpp` (servidor de
eco), pendiente de migrar aquí cuando exista lógica real que enrutar.
