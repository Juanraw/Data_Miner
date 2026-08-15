# ADR-007: Formato del manifiesto de proveniencia

**Estado:** Aceptado — 2026-08-14

## Contexto
Cada ejecución de pipeline sobre un sujeto debe poder responder: qué dataset de
entrada, qué versión de cada algoritmo, qué parámetros, cuándo, y si es reproducible.

## Decisión
Un archivo JSON sidecar por sujeto/ejecución, escrito junto al resultado en
`data/processed/` (ADR-005). No se introduce una base de datos para esto en esta
fase — un JSON por ejecución es suficiente y trivialmente inspeccionable a mano.
Contenido mínimo:

```json
{
  "input_file": "data/raw/sujeto_057.set",
  "input_sha256": "...",
  "app_version": "<git tag o commit corto>",
  "pipeline": [
    {"stage": "filter", "algorithm_version": "1.0.0", "params": {"...": "..."}},
    {"stage": "rereference", "algorithm_version": "1.0.0", "params": {"...": "..."}}
  ],
  "started_at": "...",
  "finished_at": "...",
  "status": "ok"
}
```

## Consecuencias
La versión de cada algoritmo se rastrea independientemente de la versión de la
aplicación (necesario para comparar corridas hechas con distintas versiones de un
mismo algoritmo). Si más adelante el volumen de ejecuciones lo justifica, estos JSON
pueden indexarse en SQLite sin cambiar el formato de origen.
