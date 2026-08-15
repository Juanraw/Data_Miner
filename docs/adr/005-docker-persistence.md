# ADR-005: Persistencia y volúmenes Docker

**Estado:** Aceptado — 2026-08-14

## Contexto
`docker-compose.yml` no declaraba volúmenes: cualquier archivo escrito dentro del
contenedor se perdía al recrearlo, y no había forma de que el contenedor viera
datasets del host.

## Decisión
Tres directorios de datos en la raíz del repo, montados como bind mounts:

```text
./data/raw/        → /app/data/raw        (datasets de entrada, .set/.fdt/.csv)
./data/processed/  → /app/data/processed  (resultados de pipelines)
./data/logs/        → /app/data/logs       (logs de ejecución, manifiestos)
```

`data/*` está en `.gitignore` (excepto `.gitkeep`) — nunca se versionan datasets ni
resultados en git; la trazabilidad de qué se procesó vive en los manifiestos de
proveniencia (ADR-007), no en el historial de git.

## Consecuencias
`docker-compose.yml` se actualiza para declarar estos tres `volumes:`. La estructura
de carpetas existe desde ahora aunque no haya ningún importador todavía que la use.
