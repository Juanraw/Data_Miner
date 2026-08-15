import type { DatasetInfo, FilterResponse } from '../api';

interface Props {
  info: DatasetInfo | null;
  filterMetrics: FilterResponse | null;
}

export function MetricsPanel({ info, filterMetrics }: Props) {
  const throughput =
    info && filterMetrics && filterMetrics.compute_time_ms > 0
      ? (info.channels * info.samples) / (filterMetrics.compute_time_ms / 1000)
      : null;

  return (
    <section className="panel">
      <h2 className="panel-title">Rendimiento</h2>
      <dl className="kv-list">
        {info && (
          <>
            <dt>Importación</dt>
            <dd>{info.import_time_ms} ms</dd>
          </>
        )}
        {filterMetrics && (
          <>
            <dt>Cómputo del filtro</dt>
            <dd>{filterMetrics.compute_time_ms} ms</dd>
          </>
        )}
        {throughput !== null && (
          <>
            <dt>Rendimiento</dt>
            <dd>{(throughput / 1e6).toFixed(1)}M muestras/s</dd>
          </>
        )}
      </dl>
    </section>
  );
}
