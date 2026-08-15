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
import { ViewPanel, type LoadedDataset, type PanelState } from './components/ViewPanel';
import { ZoomToolbar } from './components/ZoomToolbar';
import './App.css';

const PREVIEW_POINTS = 820;
const ZOOM_FACTOR = 0.6;

interface Viewport {
  start: number;
  end: number;
}

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

  const [panels, setPanels] = useState<PanelState[]>([
    { id: 1, datasetId: null, channel: 0, source: 'raw' },
  ]);
  const nextPanelId = useRef(2);
  const [previews, setPreviews] = useState<Record<number, PreviewResponse | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<number, boolean>>({});
  const [panelImporting, setPanelImporting] = useState<Record<number, boolean>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [flagsActive, setFlagsActive] = useState(false);
  const [flags, setFlags] = useState<Record<string, number[]>>({});

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listDatasets()
      .then((r) => setDatasets(r.datasets))
      .catch((e) => setError(String(e)));
  }, []);

  // --- Carga / filtro ---

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
    setPanels((prev) => [...prev, { id: nextPanelId.current++, datasetId: null, channel: 0, source: 'raw' }]);
  }

  function handleRemoveView(panelId: number) {
    setPanels((prev) => prev.filter((p) => p.id !== panelId));
    setPreviews((prev) => {
      const next = { ...prev };
      delete next[panelId];
      return next;
    });
  }

  async function handlePanelSelectDataset(panelId: number, datasetId: string) {
    setPanels((prev) =>
      prev.map((p) => (p.id === panelId ? { ...p, datasetId, channel: 0, source: 'raw' } : p)),
    );
    setPanelImporting((prev) => ({ ...prev, [panelId]: true }));
    setError(null);
    try {
      if (!loaded[datasetId]) {
        const info = await importDataset(datasetId);
        setLoaded((prev) => ({ ...prev, [datasetId]: { info, filterId: null, filtering: false } }));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setPanelImporting((prev) => ({ ...prev, [panelId]: false }));
    }
  }

  function handlePanelSelectChannel(panelId: number, channel: number) {
    setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, channel } : p)));
  }

  function handlePanelSelectSource(panelId: number, source: 'raw' | 'filtered') {
    setPanels((prev) => prev.map((p) => (p.id === panelId ? { ...p, source } : p)));
  }

  async function handleSavePanel(panel: PanelState) {
    if (!panel.datasetId) return;
    const ld = loaded[panel.datasetId];
    if (!ld) return;
    setSaving((prev) => ({ ...prev, [panel.id]: true }));
    setError(null);
    try {
      await saveSignal({
        datasetId: panel.datasetId,
        source: panel.source,
        filterId: panel.source === 'filtered' ? ld.filterId ?? undefined : undefined,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving((prev) => ({ ...prev, [panel.id]: false }));
    }
  }

  // Refresca el preview de cada panel cuando cambian sus selecciones, los
  // datasets cargados (p.ej. al terminar un filtro) o el viewport global.
  useEffect(() => {
    panels.forEach((panel) => {
      if (!panel.datasetId) return;
      const ld = loaded[panel.datasetId];
      if (!ld) return;
      if (panel.source === 'filtered' && !ld.filterId) return;

      setPreviewLoading((prev) => ({ ...prev, [panel.id]: true }));
      const start = viewport ? viewport.start * ld.info.sampling_rate_hz : undefined;
      const end = viewport ? viewport.end * ld.info.sampling_rate_hz : undefined;

      getPreview({
        id: panel.source === 'raw' ? panel.datasetId : undefined,
        filterId: panel.source === 'filtered' ? ld.filterId ?? undefined : undefined,
        channel: panel.channel,
        maxPoints: PREVIEW_POINTS,
        start,
        end,
      })
        .then((p) => setPreviews((prev) => ({ ...prev, [panel.id]: p })))
        .catch((e) => setError(String(e)))
        .finally(() => setPreviewLoading((prev) => ({ ...prev, [panel.id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panels, loaded, viewport]);

  // --- Zoom / pan / home ---

  function referenceDuration(): number {
    const durations = panels
      .map((p) => (p.datasetId ? loaded[p.datasetId]?.info.duration_seconds : undefined))
      .filter((d): d is number => !!d && d > 0);
    return durations.length ? Math.max(...durations) : 60;
  }

  function handleZoomIn() {
    const ref = referenceDuration();
    const [s, e] = viewport ? [viewport.start, viewport.end] : [0, ref];
    const center = (s + e) / 2;
    const half = Math.max(((e - s) * ZOOM_FACTOR) / 2, 0.25);
    setViewport({ start: Math.max(0, center - half), end: Math.min(ref, center + half) });
  }

  function handleZoomOut() {
    const ref = referenceDuration();
    const [s, e] = viewport ? [viewport.start, viewport.end] : [0, ref];
    const center = (s + e) / 2;
    const half = (e - s) / ZOOM_FACTOR / 2;
    const start = Math.max(0, center - half);
    const end = Math.min(ref, center + half);
    if (end - start >= ref * 0.98) {
      setViewport(null);
      return;
    }
    setViewport({ start, end });
  }

  function handlePanLeft() {
    if (!viewport) return;
    const range = viewport.end - viewport.start;
    const shift = range * 0.25;
    const start = Math.max(0, viewport.start - shift);
    setViewport({ start, end: start + range });
  }

  function handlePanRight() {
    if (!viewport) return;
    const ref = referenceDuration();
    const range = viewport.end - viewport.start;
    const shift = range * 0.25;
    const end = Math.min(ref, viewport.end + shift);
    setViewport({ start: end - range, end });
  }

  // --- Flags ---

  function handleFlagClick(datasetId: string, sample: number) {
    setFlags((prev) => ({ ...prev, [datasetId]: [...(prev[datasetId] ?? []), sample] }));
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
        </aside>

        <main className="charts">
          <ZoomToolbar
            hasViewport={viewport !== null}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onPanLeft={handlePanLeft}
            onPanRight={handlePanRight}
            onHome={() => setViewport(null)}
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
                preview={previews[panel.id] ?? null}
                loadingPreview={!!previewLoading[panel.id]}
                loadingImport={!!panelImporting[panel.id]}
                onSelectDataset={(id) => handlePanelSelectDataset(panel.id, id)}
                onSelectChannel={(ch) => handlePanelSelectChannel(panel.id, ch)}
                onSelectSource={(src) => handlePanelSelectSource(panel.id, src)}
                onRemove={() => handleRemoveView(panel.id)}
                onSave={() => handleSavePanel(panel)}
                saving={!!saving[panel.id]}
                canRemove={panels.length > 1}
                colorVar={panel.source === 'raw' ? '--series-1' : '--series-2'}
                flags={panel.datasetId ? flags[panel.datasetId] ?? [] : []}
                flagsActive={flagsActive}
                onFlagClick={(sample) => panel.datasetId && handleFlagClick(panel.datasetId, sample)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
