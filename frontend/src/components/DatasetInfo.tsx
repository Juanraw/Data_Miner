import type { DatasetInfo as DatasetInfoT } from '../api';

interface Props {
  info: DatasetInfoT;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function DatasetInfo({ info }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Metadata</h2>
      <dl className="kv-list">
        <dt>Sujeto</dt>
        <dd>{info.subject_id || '—'}</dd>
        <dt>Canales</dt>
        <dd>{info.channels}</dd>
        <dt>Frecuencia de muestreo</dt>
        <dd>{info.sampling_rate_hz} Hz</dd>
        <dt>Muestras</dt>
        <dd>{info.samples.toLocaleString()}</dd>
        <dt>Duración</dt>
        <dd>{formatDuration(info.duration_seconds)}</dd>
        <dt>Referencia</dt>
        <dd>{info.reference.trim() || '—'}</dd>
        <dt>Eventos</dt>
        <dd>{info.events}</dd>
        <dt>Tipo</dt>
        <dd>
          {info.epoched
            ? `Epocado (${info.n_epochs} × ${info.samples_per_epoch} muestras)`
            : 'Continuo'}
        </dd>
      </dl>
    </section>
  );
}
