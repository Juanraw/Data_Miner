import type { DatasetEntry, DatasetInfo, PreviewResponse } from '../api';
import { WaveformPanel } from './WaveformPanel';

export interface LoadedDataset {
  info: DatasetInfo;
  filterId: string | null;
  filtering: boolean;
}

export interface Viewport {
  start: number;
  end: number;
}

export interface PanelState {
  id: number;
  datasetId: string | null;
  channel: number;
  source: 'raw' | 'filtered';
  viewport: Viewport | null; // independiente por vista
}

interface Props {
  panel: PanelState;
  datasets: DatasetEntry[];
  loaded: Record<string, LoadedDataset>;
  preview: PreviewResponse | null;
  loadingPreview: boolean;
  loadingImport: boolean;
  onSelectDataset: (datasetId: string) => void;
  onSelectChannel: (channel: number) => void;
  onSelectSource: (source: 'raw' | 'filtered') => void;
  onRemove: () => void;
  onSave: () => void;
  saving: boolean;
  canRemove: boolean;
  colorVar: string;
  flags: number[];
  flagsActive: boolean;
  onFlagClick: (sample: number) => void;
  onFlagRemove: (sample: number) => void;
  onZoomSelect: (startSeconds: number, endSeconds: number) => void;
  onWheelPan: (direction: 1 | -1) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanLeft: () => void;
  onPanRight: () => void;
  onHome: () => void;
}

export function ViewPanel({
  panel,
  datasets,
  loaded,
  preview,
  loadingPreview,
  loadingImport,
  onSelectDataset,
  onSelectChannel,
  onSelectSource,
  onRemove,
  onSave,
  saving,
  canRemove,
  colorVar,
  flags,
  flagsActive,
  onFlagClick,
  onFlagRemove,
  onZoomSelect,
  onWheelPan,
  onZoomIn,
  onZoomOut,
  onPanLeft,
  onPanRight,
  onHome,
}: Props) {
  const current = panel.datasetId ? loaded[panel.datasetId] : undefined;
  const hasViewport = panel.viewport !== null;

  return (
    <div className="view-panel">
      <div className="view-panel-controls">
        <select
          className="select"
          value={panel.datasetId ?? ''}
          onChange={(e) => onSelectDataset(e.target.value)}
        >
          <option value="" disabled>
            Elegir dataset…
          </option>
          {datasets.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {current && (
          <select
            className="select"
            value={panel.channel}
            onChange={(e) => onSelectChannel(Number(e.target.value))}
          >
            {current.info.channel_labels.map((label, idx) => (
              <option key={idx} value={idx}>
                {idx}. {label}
              </option>
            ))}
          </select>
        )}

        {current && (
          <div className="segmented">
            <button
              className={panel.source === 'raw' ? 'active' : ''}
              onClick={() => onSelectSource('raw')}
            >
              Original
            </button>
            <button
              className={panel.source === 'filtered' ? 'active' : ''}
              onClick={() => onSelectSource('filtered')}
              disabled={!current.filterId && !current.filtering}
            >
              {current.filtering ? 'Filtrando…' : 'Filtrado'}
            </button>
          </div>
        )}

        {current && (
          <button className="button-icon" onClick={onSave} disabled={saving} title="Guardar esta señal">
            {saving ? 'Guardando…' : '💾 Guardar'}
          </button>
        )}

        {canRemove && (
          <button className="button-icon view-panel-remove" onClick={onRemove} title="Quitar esta vista">
            ×
          </button>
        )}
      </div>

      {current && (
        <div className="view-panel-zoom">
          <button className="button-icon" onClick={onPanLeft} disabled={!hasViewport} title="Mover a la izquierda">
            ◀
          </button>
          <button className="button-icon" onClick={onZoomOut} title="Alejar">
            −
          </button>
          <button className="button-icon" onClick={onZoomIn} title="Acercar">
            +
          </button>
          <button className="button-icon" onClick={onPanRight} disabled={!hasViewport} title="Mover a la derecha">
            ▶
          </button>
          <button className="button-icon" onClick={onHome} disabled={!hasViewport} title="Vista inicial">
            ⌂ Inicio
          </button>
        </div>
      )}

      {!panel.datasetId ? (
        <div className="empty-state">Elige un dataset para esta vista.</div>
      ) : (
        <WaveformPanel
          title={current?.info.subject_id || panel.datasetId}
          colorVar={colorVar}
          preview={preview}
          loading={loadingPreview || loadingImport}
          flags={flags}
          flagsActive={flagsActive}
          onFlagClick={onFlagClick}
          onFlagRemove={onFlagRemove}
          onZoomSelect={onZoomSelect}
          onWheelPan={onWheelPan}
        />
      )}
    </div>
  );
}
