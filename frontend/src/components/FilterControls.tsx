import type { FilterParams, FilterType } from '../api';

interface Props {
  params: FilterParams;
  onChange: (params: FilterParams) => void;
  onApply: () => void;
  loading: boolean;
  selectedCount: number;
}

export function FilterControls({ params, onChange, onApply, loading, selectedCount }: Props) {
  const needsLow = params.type === 'highpass' || params.type === 'bandpass';
  const needsHigh = params.type === 'lowpass' || params.type === 'bandpass';

  let label = 'Selecciona un dataset';
  if (selectedCount === 1) label = 'Aplicar filtro';
  else if (selectedCount > 1) label = `Aplicar en lote (${selectedCount})`;
  if (loading) label = selectedCount > 1 ? 'Procesando lote…' : 'Filtrando…';

  return (
    <section className="panel">
      <h2 className="panel-title">Filtro FIR</h2>
      <label className="field">
        <span>Tipo</span>
        <select
          className="select"
          value={params.type}
          onChange={(e) => onChange({ ...params, type: e.target.value as FilterType })}
        >
          <option value="lowpass">Pasa bajos</option>
          <option value="highpass">Pasa altos</option>
          <option value="bandpass">Pasa banda</option>
        </select>
      </label>
      {needsLow && (
        <label className="field">
          <span>Corte inferior (Hz)</span>
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            value={params.low_hz}
            onChange={(e) => onChange({ ...params, low_hz: Number(e.target.value) })}
          />
        </label>
      )}
      {needsHigh && (
        <label className="field">
          <span>Corte superior (Hz)</span>
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            value={params.high_hz}
            onChange={(e) => onChange({ ...params, high_hz: Number(e.target.value) })}
          />
        </label>
      )}
      <label className="field">
        <span>Taps (impar)</span>
        <input
          className="input"
          type="number"
          step="2"
          min="3"
          value={params.n_taps}
          onChange={(e) => onChange({ ...params, n_taps: Number(e.target.value) })}
        />
      </label>
      <button className="button-primary" onClick={onApply} disabled={selectedCount === 0 || loading}>
        {label}
      </button>
    </section>
  );
}
