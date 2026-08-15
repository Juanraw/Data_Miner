# ADR-004: Modelo de concurrencia del backend

**Estado:** Aceptado — 2026-08-14

## Contexto
El servidor actual corre `net::io_context ioc(1)` monohilo — una sola llamada a
`ioc.run()`. Un cómputo largo (ICA sobre un sujeto) bloquearía todas las conexiones,
incluida la UI, si el procesamiento corriera en ese mismo hilo/contexto.

## Decisión
Separar en dos dominios de concurrencia desde el diseño del `executor/`, no como
optimización posterior:
1. **Dominio de red** (`api/`): el `io_context` de Boost.Asio/Beast, dedicado solo a
   aceptar conexiones y mover bytes.
2. **Dominio de cómputo** (`executor/`): un pool de workers dimensionado a núcleos de
   CPU disponibles, que ejecuta pipelines por sujeto. Se comunica con `api/`
   únicamente a través de una cola de trabajos y actualizaciones de estado — nunca
   comparte el hilo del `io_context`.

Un sujeto que falla se aísla (excepción capturada en su propio worker) sin afectar a
los demás; el estado por sujeto se persiste para permitir reanudación (ver
roadmap, Fase 7).

## Consecuencias
El demo actual en `main.cpp` no respeta este modelo (todo en un `io_context(1)`) y
debe tratarse como código de referencia a reemplazar, no como base del `api/` final.
