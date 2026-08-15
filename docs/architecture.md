# Arquitectura

Diagrama aceptado tras la auditoría técnica del 2026-08-14 (decisiones detalladas en
`docs/adr/`). El núcleo científico (`importers/`, `algorithms/`, `core/`,
`executor/`) debe poder ejecutarse sin `api/` — sin red, sin frontend.

```text
                    ┌─────────────────┐
                    │    React UI     │
                    └────────┬────────┘
                             │
                 HTTP (control/metadata) + WS (eventos/progreso)
                             │
                    ┌────────▼────────┐
                    │   API Layer     │  (delgada: valida, traduce, no procesa)
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Pipeline/Batch  │  (cola de trabajos, pool de workers,
                    │    Executor     │   estado persistido por sujeto)
                    └────────┬────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      Importers          Algorithms        Internal Data
   (.set/.fdt/.csv)   (filtros/ICA/ASR,    Representation
                        funciones puras)    (canal-contiguo,
          │                  │               float32 + metadata)
          └──────────────────┴──────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Filesystem/Volumen│  (datasets originales, resultados,
                    │   compartido       │   logs, manifiestos de proveniencia)
                    └─────────────────┘
```

## Reglas de dependencia
- `algorithms/` no importa nada de `api/` ni `executor/`.
- `api/` no importa nada de `algorithms/` directamente — solo habla con `executor/`.
- Datasets grandes viajan por filesystem compartido (`data/`), no por red
  (ADR-006). El navegador nunca recibe una matriz de señal completa.

## Estado actual (2026-08-14)
Todo lo anterior es la arquitectura objetivo. Lo único implementado hoy es un
servidor de demostración (`backend/src/main.cpp`, HTTP+WS monohilo con eco) que
sirve como prueba de que React puede hablar con C++ dentro de Docker — no respeta
todavía la separación `api/` ↔ `executor/` (ver ADR-004) y debe tratarse como código
a reemplazar, no como base del `api/` final. Ver auditoría completa en el historial
de la sesión que originó esta estructura para el detalle de cada decisión.

## Roadmap (resumen — detalle en la sesión de auditoría)
Fase -1 Fundamentos (git, flags de build, estructura de carpetas) → Fase 0
Arquitectura/ADRs → Fase 1 Data model → Fase 2 SET importer + visor crudo →
Fase 3 Processing engine headless → Fase 4 Filtros → Fase 5 Rereferenciación →
Fase 6 Pipeline engine con proveniencia → Fase 7 Batch processing → Fase 8 ASR →
Fase 9 ICA → Fase 10 Visualización avanzada → Fase 11 Exportación →
Fase 12 Validación científica → Fase 13 Testing → Fase 14 Optimización →
Fase 15 Deployment.
