import type { DatasetEntry, DatasetInfo, PreviewResponse } from '../api';
import { WaveformPanel, type SeriesDisplay, type TimeRange } from './WaveformPanel';

export interface LoadedDataset {
  info: DatasetInfo;
  filterId: string | null;
  filtering: boolean;
}

export interface Viewport {
  start: number;
  end: number;
}

export interface SeriesRef {
  seriesId: number;
  datasetId: string | null;
  channel: number;
  source: 'raw' | 'filtered';
}

export interface PanelState {
  id: number;
  series: SeriesRef[]; // al menos 1 -- superponer agrega más
  viewport: Viewport | null; // independiente por vista
}

const SERIES_COLOR_VARS = [
  '--series-1',
  '--series-2',
  '--series-3',
  '--series-4',
  '--series-5',
  '--series-6',
  '--series-7',
  '--series-8',
];

function colorVarForIndex(i: number): string {
  return SERIES_COLOR_VARS[i % SERIES_COLOR_VARS.length];
}

function seriesLabel(s: SeriesRef, loaded: Record<string, LoadedDataset>): string {
  if (!s.datasetId) return '—';
  const ld = loaded[s.datasetId];
  const subject = ld?.info.subject_id || s.datasetId.split('/').pop();
  const channelLabel = ld?.info.channel_labels[s.channel] ?? s.channel;
  const sourceLabel = s.source === 'raw' ? 'original' : 'filtrada';
  return `${subject} · ${channelLabel} (${sourceLabel})`;
}

interface Props {
  panel: PanelState;
  datasets: DatasetEntry[];
  loaded: Record<string, LoadedDataset>;
  previews: Record<number, PreviewResponse | null>; // por seriesId
  previewLoading: Record<number, boolean>;
  seriesImporting: Record<number, boolean>;
  timeRange: TimeRange;
  onSelectDataset: (seriesId: number, datasetId: string) => void;
  onSelectChannel: (seriesId: number, channel: number) => void;
  onSelectSource: (seriesId: number, source: 'raw' | 'filtered') => void;
  onAddSeries: () => void;
  onRemoveSeries: (seriesId: number) => void;
  onSaveSeries: (seriesId: number) => void;
  savingSeries: Record<number, boolean>;
  onRemove: () => void;
  canRemove: boolean;
  flagTimes: number[];
  flagsActive: boolean;
  onFlagClick: (timeSeconds: number) => void;
  onFlagRemove: (timeSeconds: number) => void;
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
  previews,
  previewLoading,
  seriesImporting,
  timeRange,
  onSelectDataset,
  onSelectChannel,
  onSelectSource,
  onAddSeries,
  onRemoveSeries,
  onSaveSeries,
  savingSeries,
  onRemove,
  canRemove,
  flagTimes,
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
  const hasViewport = panel.viewport !== null;
  const anyLoaded = panel.series.some((s) => s.datasetId);
  const anyLoading = panel.series.some((s) => previewLoading[s.seriesId] || seriesImporting[s.seriesId]);

  const displaySeries: SeriesDisplay[] = panel.series
    .filter((s) => s.datasetId && (s.source === 'raw' || loaded[s.datasetId]?.filterId))
    .map((s, i) => ({
      key: String(s.seriesId),
      label: seriesLabel(s, loaded),
      colorVar: colorVarForIndex(i),
      preview: previews[s.seriesId] ?? null,
    }));

  return (
    <div className="view-panel">
      {panel.series.map((s, idx) => {
        const current = s.datasetId ? loaded[s.datasetId] : undefined;
        return (
          <div className="series-row" key={s.seriesId}>
            <span className="series-swatch" style={{ background: `var(${colorVarForIndex(idx)})` }} />
            <select className="select" value={s.datasetId ?? ''} onChange={(e) => onSelectDataset(s.seriesId, e.target.value)}>
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
                value={s.channel}
                onChange={(e) => onSelectChannel(s.seriesId, Number(e.target.value))}
              >
                {current.info.channel_labels.map((label, chIdx) => (
                  <option key={chIdx} value={chIdx}>
                    {chIdx}. {label}
                  </option>
                ))}
              </select>
            )}

            {current && (
              <div className="segmented">
                <button className={s.source === 'raw' ? 'active' : ''} onClick={() => onSelectSource(s.seriesId, 'raw')}>
                  Original
                </button>
                <button
                  className={s.source === 'filtered' ? 'active' : ''}
                  onClick={() => onSelectSource(s.seriesId, 'filtered')}
                  disabled={!current.filterId && !current.filtering}
                >
                  {current.filtering ? 'Filtrando…' : 'Filtrado'}
                </button>
              </div>
            )}

            {current && (
              <button
                className="button-icon"
                onClick={() => onSaveSeries(s.seriesId)}
                disabled={savingSeries[s.seriesId]}
                title="Guardar esta señal"
              >
                {savingSeries[s.seriesId] ? '…' : '💾'}
              </button>
            )}

            {panel.series.length > 1 && (
              <button className="button-icon" onClick={() => onRemoveSeries(s.seriesId)} title="Quitar esta señal">
                ×
              </button>
            )}
          </div>
        );
      })}

      <div className="view-panel-controls">
        <button className="button-icon" onClick={onAddSeries} title="Superponer otra señal en esta misma vista">
          + Superponer señal
        </button>
        {canRemove && (
          <button className="button-icon view-panel-remove" onClick={onRemove} title="Quitar esta vista">
            Quitar vista
          </button>
        )}
      </div>

      {anyLoaded && (
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

      {!anyLoaded ? (
        <div className="empty-state">Elige un dataset para esta vista.</div>
      ) : (
        <WaveformPanel
          title={displaySeries.length === 1 ? displaySeries[0].label : ''}
          series={displaySeries}
          timeRange={timeRange}
          loading={anyLoading && displaySeries.every((s) => !s.preview)}
          flagTimes={flagTimes}
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
