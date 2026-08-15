import type { DatasetInfo } from '../api';

interface LoadedLike {
  info: DatasetInfo;
}

interface Props {
  flags: Record<string, number[]>;
  loaded: Record<string, LoadedLike>;
  onRemove: (datasetId: string, sample: number) => void;
}

export function FlagsPanel({ flags, loaded, onRemove }: Props) {
  const entries = Object.entries(flags).filter(([, samples]) => samples.length > 0);
  if (entries.length === 0) return null;

  return (
    <section className="panel">
      <h2 className="panel-title">Flags</h2>
      {entries.map(([datasetId, samples]) => {
        const srate = loaded[datasetId]?.info.sampling_rate_hz ?? 1;
        return (
          <div key={datasetId} className="flags-group">
            <div className="muted flags-group-title">{datasetId.split('/').pop()}</div>
            <ul className="flags-list">
              {samples.map((sample) => (
                <li key={sample}>
                  <span>{(sample / srate).toFixed(2)}s</span>
                  <button
                    className="button-icon"
                    onClick={() => onRemove(datasetId, sample)}
                    title="Quitar este flag"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
