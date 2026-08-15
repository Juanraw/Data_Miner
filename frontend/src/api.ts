export interface DatasetEntry {
  id: string;
  name: string;
  size_bytes: number;
}

export interface DatasetInfo {
  id: string;
  channels: number;
  samples: number;
  sampling_rate_hz: number;
  duration_seconds: number;
  reference: string;
  subject_id: string;
  channel_labels: string[];
  events: number;
  epoched: boolean;
  n_epochs?: number;
  samples_per_epoch?: number;
  import_time_ms: number;
}

export interface PreviewResponse {
  channel: number;
  channel_label: string;
  sampling_rate_hz: number;
  start_sample: number;
  end_sample: number;
  bucket_samples: number;
  min: number[];
  max: number[];
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

export interface FilterParams {
  type: FilterType;
  low_hz: number;
  high_hz: number;
  n_taps: number;
}

export interface FilterResponse {
  filter_id: string;
  compute_time_ms: number;
}

export interface BatchItemStatus {
  dataset_id: string;
  status: 'pending' | 'running' | 'done' | 'error';
  filter_id?: string;
  compute_time_ms?: number;
  error?: string;
}

export interface BatchResponse {
  items: BatchItemStatus[];
  all_done: boolean;
}

export interface SaveResponse {
  dir: string;
  bin_file: string;
  json_file: string;
}

class ApiError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `Error ${res.status}`);
  }
  return body as T;
}

async function postJson<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError((body as { error?: string }).error ?? `Error ${res.status}`);
  }
  return body as T;
}

export function listDatasets(): Promise<{ datasets: DatasetEntry[] }> {
  return getJson('/api/datasets');
}

export function importDataset(id: string): Promise<DatasetInfo> {
  return getJson(`/api/import?id=${encodeURIComponent(id)}`);
}

export function getPreview(params: {
  id?: string;
  filterId?: string;
  channel: number;
  maxPoints: number;
  start?: number;
  end?: number;
}): Promise<PreviewResponse> {
  const q = new URLSearchParams();
  if (params.filterId) {
    q.set('source', 'filtered');
    q.set('filter_id', params.filterId);
  } else if (params.id) {
    q.set('id', params.id);
  }
  q.set('channel', String(params.channel));
  q.set('max_points', String(params.maxPoints));
  if (params.start !== undefined) q.set('start', String(Math.max(0, Math.floor(params.start))));
  if (params.end !== undefined) q.set('end', String(Math.max(0, Math.ceil(params.end))));
  return getJson(`/api/preview?${q.toString()}`);
}

export function applyFilter(datasetId: string, params: FilterParams): Promise<FilterResponse> {
  return postJson('/api/filter', { dataset_id: datasetId, ...params });
}

export function batchFilter(datasetIds: string[], params: FilterParams): Promise<{ batch_id: string }> {
  return postJson('/api/batch-filter', { dataset_ids: datasetIds, ...params });
}

export function getBatch(batchId: string): Promise<BatchResponse> {
  return getJson(`/api/batch?id=${encodeURIComponent(batchId)}`);
}

export function saveSignal(params: {
  datasetId: string;
  source: 'raw' | 'filtered';
  filterId?: string;
}): Promise<SaveResponse> {
  return postJson('/api/save', {
    dataset_id: params.datasetId,
    source: params.source,
    ...(params.filterId ? { filter_id: params.filterId } : {}),
  });
}
