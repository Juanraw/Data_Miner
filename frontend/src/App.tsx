import { useEffect, useRef, useState } from 'react';
import {
  applyFilter,
  batchFilter,
  getBatch,
  getPreview,
  importDataset,
  listDatasets,
  saveSignal,
  type BatchItemStatus,
  type DatasetEntry,
  type DatasetInfo,
  type FilterParams,
  type PreviewResponse,
} from './api';
import { BatchProgress } from './components/BatchProgress';
import { DatasetPicker } from './components/DatasetPicker';
import { FilterControls } from './components/FilterControls';
import { FlagsPanel } from './components/FlagsPanel';
import { ViewPanel, type LoadedDataset, type PanelState, type Viewport } from './components/ViewPanel';
import { ZoomToolbar } from './components/ZoomToolbar';
import './App.css';

const PREVIEW_POINTS = 820;
const ZOOM_FACTOR = 0.6;

function App() {
  const [datasets, setDatasets] = useState<DatasetEntry[]>([]);
  const [loaded, setLoaded] = useState<Record<string, LoadedDataset>>({});
  const [selectedForBatch, setSelectedForBatch] = useState<Set<string>>(new Set());

  const [filterParams, setFilterParams] = useState<FilterParams>({
    type: 'highpass',
    low_hz: 1,
    high_hz: 0,
    n_taps: 201,
  });
  const [applyingFilter, setApplyingFilter] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItemStatus[] | null>(null);

  const nextPanelId = useRef(2);
  const nextSeriesId = useRef(2);
  const [panels, setPanels] = useState<PanelState[]>([
    { id: 1, series: [{ seriesId: 1, datasetId: null, channel: 0, source: 'raw' }], viewport: null },
  ]);
  const [previews, setPreviews] = useState<Record<number, PreviewResponse | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});
  const [seriesImporting, setSeriesImporting] = useState<Record<number, boolean>>({});
  const [savingSeries, setSavingSeries] = useState<Record<number, boolean>>({});

  const [flagsActive, setFlagsActive] = useState(false);
  const [flags, setFlags] = useState<Record<string, number[]>>({});

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDatasets()
      .then((r) => setDatasets(r.datasets))
      .catch((e) => setError(String(e)));
  }, []);

  // --- Carga / filtro (a nivel de dataset, independiente de cuántas series lo usen) ---

  async function markFiltering(id: string, filtering: boolean): Promise<DatasetInfo> {
    const info = await importDataset(id);
    setLoaded((prev) => ({
      ...prev,
      [id]: { info, filterId: prev[id]?.filterId ?? null, filtering },
    }));
    return info;
  }

  async function pollBatchUntilDone(batchId: string) {
    const settled = new Set<string>();
    for (;;) {
      const res = await getBatch(batchId);
      setBatchItems(res.items);
      for (const item of res.items) {
        if (settled.has(item.dataset_id)) continue;
        if (item.status === 'done') {
          settled.add(item.dataset_id);
          setLoaded((prev) => ({
            ...prev,
            [item.dataset_id]: { ...prev[item.dataset_id], filterId: item.filter_id ?? null, filtering: false },
          }));
        } else if (item.status === 'error') {
          settled.add(item.dataset_id);
          setError(`${item.dataset_id}: ${item.error ?? 'error desconocido'}`);
          setLoaded((prev) => ({
            ...prev,
            [item.dataset_id]: { ...prev[item.dataset_id], filtering: false },
          }));
        }
      }
      if (res.all_done) break;
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }

  function toggleDatasetSelection(id: string) {
    setSelectedForBatch((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApplyFilter() {
    const ids = Array.from(selectedForBatch);
    if (ids.length === 0) return;
    setError(null);
    setApplyingFilter(true);
    setBatchItems(null);
    try {
      if (ids.length === 1) {
        const id = ids[0];
        await markFiltering(id, true);
        const result = await applyFilter(id, filterParams);
        const info = await importDataset(id);
        setLoaded((prev) => ({ ...prev, [id]: { info, filterId: result.filter_id, filtering: false } }));
      } else {
        for (const id of ids) await markFiltering(id, true);
        const { batch_id } = await batchFilter(ids, filterParams);
        await pollBatchUntilDone(batch_id);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setApplyingFilter(false);
    }
  }

  // --- Paneles de vista ---

  function handleAddView() {
    setPanels((prev) => [
      ...prev,
      { id: nextPanelId.current++, series: [{ seriesId: nextSeriesId.current++, datasetId: null, channel: 0, source: 'raw' }], viewport: null },
    ]);
  }

  function cleanupSeriesState(seriesId: number) {
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[seriesId];
      return next;
    });
    setPreviewLoading((prev) => {
      const next = { ...prev };
      delete next[seriesId];
      return next;
    });
    setSeriesImporting((prev) => {
      const next = { ...prev };
      delete next[seriesId];
      return next;
    });
    setSavingSeries((prev) => {
      const next = { ...prev };
      delete next[seriesId];
      return next;
    });
  }

  function handleRemoveView(panelId: number) {
    const panel = panels.find((p) => p.id === panelId);
    panel?.series.forEach((s) => cleanupSeriesState(s.seriesId));
    setPanels((prev) => prev.filter((p) => p.id !== panelId));
  }

  // --- Series dentro de una vista (superponer señales) ---

  function handleAddSeries(panelId: number) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? { ...p, series: [...p.series, { seriesId: nextSeriesId.current++, datasetId: null, channel: 0, source: 'raw' as const }] }
          : p,
      ),
    );
  }

  function handleRemoveSeries(panelId: number, seriesId: number) {
    setPanels((prev) =>
      prev.map((p) => (p.id === panelId ? { ...p, series: p.series.filter((s) => s.seriesId !== seriesId) } : p)),
    );
    cleanupSeriesState(seriesId);
  }

  async function handleSeriesSelectDataset(panelId: number, seriesId: number, datasetId: string) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId
          ? {
              ...p,
              series: p.series.map((s) =>
                s.seriesId === seriesId ? { ...s, datasetId, channel: 0, source: 'raw' as const } : s,
              ),
            }
          : p,
      ),
    );
    setSeriesImporting((prev) => ({ ...prev, [seriesId]: true }));
    setError(null);
    try {
      if (!loaded[datasetId]) {
        const info = await importDataset(datasetId);
        setLoaded((prev) => ({ ...prev, [datasetId]: { info, filterId: null, filtering: false } }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSeriesImporting((prev) => ({ ...prev, [seriesId]: false }));
    }
  }

  function handleSeriesSelectChannel(panelId: number, seriesId: number, channel: number) {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId ? { ...p, series: p.series.map((s) => (s.seriesId === seriesId ? { ...s, channel } : s)) } : p,
      ),
    );
  }

  function handleSeriesSelectSource(panelId: number, seriesId: number, source: 'raw' | 'filtered') {
    setPanels((prev) =>
      prev.map((p) =>
        p.id === panelId ? { ...p, series: p.series.map((s) => (s.seriesId === seriesId ? { ...s, source } : s)) } : p,
      ),
    );
  }

  async function handleSaveSeries(panelId: number, seriesId: number) {
    const panel = panels.find((p) => p.id === panelId);
    const s = panel?.series.find((x) => x.seriesId === seriesId);
    if (!s || !s.datasetId) return;
    const ld = loaded[s.datasetId];
    if (!ld) return;
    setSavingSeries((prev) => ({ ...prev, [seriesId]: true }));
    setError(null);
    try {
      await saveSignal({
        datasetId: s.datasetId,
        source: s.source,
        filterId: s.source === 'filtered' ? ld.filterId ?? undefined : undefined,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingSeries((prev) => ({ ...prev, [seriesId]: false }));
    }
  }

  // --- Rango de tiempo / duración de referencia por vista ---

  function panelReferenceDuration(panel: PanelState): number {
    const durations = panel.series
      .map((s) => (s.datasetId ? loaded[s.datasetId]?.info.duration_seconds : undefined))
      .filter((d): d is number => !!d && d > 0);
    return durations.length ? Math.max(...durations) : 60;
  }

  function panelTimeRange(panel: PanelState): Viewport {
    return panel.viewport ?? { start: 0, end: panelReferenceDuration(panel) };
  }

  // Refresca el preview de cada serie de cada panel cuando cambian sus
  // selecciones, los datasets cargados, o el viewport del panel.
  useEffect(() => {
    panels.forEach((panel) => {
      const range = panelTimeRange(panel);
      panel.series.forEach((s) => {
        if (!s.datasetId) return;
        const ld = loaded[s.datasetId];
        if (!ld) return;
        if (s.source === 'filtered' && !ld.filterId) return;

        setPreviewLoading((prev) => ({ ...prev, [s.seriesId]: true }));
        const start = range.start * ld.info.sampling_rate_hz;
        const end = range.end * ld.info.sampling_rate_hz;

        getPreview({
          id: s.source === 'raw' ? s.datasetId : undefined,
          filterId: s.source === 'filtered' ? ld.filterId ?? undefined : undefined,
          channel: s.channel,
          maxPoints: PREVIEW_POINTS,
          start,
          end,
        })
          .then((p) => setPreviews((prev) => ({ ...prev, [s.seriesId]: p })))
          .catch((e) => setError(String(e)))
          .finally(() => setPreviewLoading((prev) => ({ ...prev, [s.seriesId]: false })));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, loaded]);

  // --- Zoom / pan / home / rueda (independiente por vista) ---

  function updatePanelViewport(panelId: number, compute: (panel: PanelState) => PanelState['viewport']) {
    setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, viewport: compute(p) } : p)));
  }

  function handlePanelZoomIn(panelId: number) {
    updatePanelViewport(panelId, (p) => {
      const ref = panelReferenceDuration(p);
      const [s, e] = p.viewport ? [p.viewport.start, p.viewport.end] : [0, ref];
      const center = (s + e) / 2;
      const half = Math.max(((e - s) * ZOOM_FACTOR) / 2, 0.25);
      return { start: Math.max(0, center - half), end: Math.min(ref, center + half) };
    });
  }

  function handlePanelZoomOut(panelId: number) {
    updatePanelViewport(panelId, (p) => {
      const ref = panelReferenceDuration(p);
      const [s, e] = p.viewport ? [p.viewport.start, p.viewport.end] : [0, ref];
      const center = (s + e) / 2;
      const half = (e - s) / ZOOM_FACTOR / 2;
      const start = Math.max(0, center - half);
      const end = Math.min(ref, center + half);
      if (end - start >= ref * 0.98) return null;
      return { start, end };
    });
  }

  function handlePanelPanLeft(panelId: number) {
    updatePanelViewport(panelId, (p) => {
      if (!p.viewport) return null;
      const range = p.viewport.end - p.viewport.start;
      const shift = range * 0.25;
      const start = Math.max(0, p.viewport.start - shift);
      return { start, end: start + range };
    });
  }

  function handlePanelPanRight(panelId: number) {
    updatePanelViewport(panelId, (p) => {
      if (!p.viewport) return null;
      const ref = panelReferenceDuration(p);
      const range = p.viewport.end - p.viewport.start;
      const shift = range * 0.25;
      const end = Math.min(ref, p.viewport.end + shift);
      return { start: end - range, end };
    });
  }

  function handlePanelHome(panelId: number) {
    updatePanelViewport(panelId, () => null);
  }

  function handlePanelZoomSelect(panelId: number, startSeconds: number, endSeconds: number) {
    updatePanelViewport(panelId, (p) => {
      const ref = panelReferenceDuration(p);
      return { start: Math.max(0, startSeconds), end: Math.min(ref, endSeconds) };
    });
  }

  function handlePanelWheelPan(panelId: number, direction: 1 | -1) {
    updatePanelViewport(panelId, (p) => {
      const ref = panelReferenceDuration(p);
      const current = p.viewport ?? { start: 0, end: Math.min(ref, Math.max(ref * 0.2, 5)) };
      const range = current.end - current.start;
      const shift = range * 0.2 * direction;

      let start = current.start + shift;
      let end = current.end + shift;
      if (start < 0) {
        start = 0;
        end = range;
      } else if (end > ref) {
        end = ref;
        start = Math.max(0, ref - range);
      }
      return { start, end };
    });
  }

  // --- Flags (por dataset; una vista con series de varios datasets marca el
  // mismo instante en todos los datasets que muestra) ---

  function panelDatasetIds(panel: PanelState): string[] {
    return Array.from(new Set(panel.series.map((s) => s.datasetId).filter((id): id is string => !!id)));
  }

  function panelFlagTimes(panel: PanelState): number[] {
    const times: number[] = [];
    for (const id of panelDatasetIds(panel)) {
      const srate = loaded[id]?.info.sampling_rate_hz;
      if (!srate) continue;
      for (const sample of flags[id] ?? []) times.push(sample / srate);
    }
    return times;
  }

  function handlePanelFlagClick(panelId: number, timeSeconds: number) {
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;
    for (const datasetId of panelDatasetIds(panel)) {
      const srate = loaded[datasetId]?.info.sampling_rate_hz;
      if (!srate) continue;
      const sample = Math.round(timeSeconds * srate);
      setFlags((prev) => ({ ...prev, [datasetId]: [...(prev[datasetId] ?? []), sample] }));
    }
  }

  function handlePanelFlagRemove(panelId: number, timeSeconds: number) {
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;
    for (const datasetId of panelDatasetIds(panel)) {
      const srate = loaded[datasetId]?.info.sampling_rate_hz;
      if (!srate) continue;
      setFlags((prev) => ({
        ...prev,
        [datasetId]: (prev[datasetId] ?? []).filter((s) => Math.abs(s / srate - timeSeconds) > 1e-3),
      }));
    }
  }

  function handleFlagRemove(datasetId: string, sample: number) {
    setFlags((prev) => ({ ...prev, [datasetId]: (prev[datasetId] ?? []).filter((s) => s !== sample) }));
  }

  const totalFlagCount = Object.values(flags).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Data Miner</h1>
        <span className="muted">Visor de señales biomédicas</span>
      </header>

      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button className="error-dismiss" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          <DatasetPicker
            datasets={datasets}
            selected={selectedForBatch}
            loadedIds={new Set(Object.keys(loaded))}
            onToggle={toggleDatasetSelection}
          />
          <FilterControls
            params={filterParams}
            onChange={setFilterParams}
            onApply={handleApplyFilter}
            loading={applyingFilter}
            selectedCount={selectedForBatch.size}
          />
          {batchItems && <BatchProgress items={batchItems} />}
          <FlagsPanel flags={flags} loaded={loaded} onRemove={handleFlagRemove} />
        </aside>

        <main className="charts">
          <ZoomToolbar
            flagsActive={flagsActive}
            onToggleFlags={() => setFlagsActive((v) => !v)}
            flagCount={totalFlagCount}
            onClearFlags={() => setFlags({})}
            onAddView={handleAddView}
          />

          <div className="panels-grid">
            {panels.map((panel) => (
              <ViewPanel
                key={panel.id}
                panel={panel}
                datasets={datasets}
                loaded={loaded}
                previews={previews}
                previewLoading={previewLoading}
                seriesImporting={seriesImporting}
                timeRange={panelTimeRange(panel)}
                onSelectDataset={(seriesId, id) => handleSeriesSelectDataset(panel.id, seriesId, id)}
                onSelectChannel={(seriesId, ch) => handleSeriesSelectChannel(panel.id, seriesId, ch)}
                onSelectSource={(seriesId, src) => handleSeriesSelectSource(panel.id, seriesId, src)}
                onAddSeries={() => handleAddSeries(panel.id)}
                onRemoveSeries={(seriesId) => handleRemoveSeries(panel.id, seriesId)}
                onSaveSeries={(seriesId) => handleSaveSeries(panel.id, seriesId)}
                savingSeries={savingSeries}
                onRemove={() => handleRemoveView(panel.id)}
                canRemove={panels.length > 1}
                flagTimes={panelFlagTimes(panel)}
                flagsActive={flagsActive}
                onFlagClick={(t) => handlePanelFlagClick(panel.id, t)}
                onFlagRemove={(t) => handlePanelFlagRemove(panel.id, t)}
                onZoomSelect={(s, e) => handlePanelZoomSelect(panel.id, s, e)}
                onWheelPan={(direction) => handlePanelWheelPan(panel.id, direction)}
                onZoomIn={() => handlePanelZoomIn(panel.id)}
                onZoomOut={() => handlePanelZoomOut(panel.id)}
                onPanLeft={() => handlePanelPanLeft(panel.id)}
                onPanRight={() => handlePanelPanRight(panel.id)}
                onHome={() => handlePanelHome(panel.id)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
