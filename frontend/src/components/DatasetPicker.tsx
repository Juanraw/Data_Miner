import type { DatasetEntry } from '../api';

interface Props {
  datasets: DatasetEntry[];
  selected: Set<string>;
  loadedIds: Set<string>;
  onToggle: (id: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DatasetPicker({ datasets, selected, loadedIds, onToggle }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Datasets</h2>
      {datasets.length === 0 ? (
        <p className="muted">
          No hay archivos .set en <code>data/raw/</code>.
        </p>
      ) : (
        <>
          <p className="muted field-hint">
            Marca uno o varios para importarlos y habilitar el filtro (1 = individual, 2+ = lote en
            paralelo).
          </p>
          <ul className="dataset-list">
            {datasets.map((d) => (
              <li key={d.id}>
                <label className={`dataset-item${selected.has(d.id) ? ' selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => onToggle(d.id)}
                  />
                  <span className="dataset-name">
                    {d.name}
                    {loadedIds.has(d.id) && <span className="loaded-badge" title="Ya importado" />}
                  </span>
                  <span className="dataset-size">{formatSize(d.size_bytes)}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
