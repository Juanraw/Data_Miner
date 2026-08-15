import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewResponse } from '../api';

interface Props {
  title: string;
  colorVar: string; // nombre de la variable CSS, ej. "--series-1"
  preview: PreviewResponse | null;
  loading?: boolean;
  height?: number;
  flags?: number[]; // índices de muestra (mismo espacio que preview.start_sample)
  flagsActive?: boolean;
  onFlagClick?: (sampleIndex: number) => void;
  onFlagRemove?: (sampleIndex: number) => void;
  onZoomSelect?: (startSeconds: number, endSeconds: number) => void;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const DRAG_THRESHOLD_PX = 5;
const FLAG_HIT_TOLERANCE_PX = 6;

interface HoverInfo {
  x: number;
  timeSeconds: number;
  min: number;
  max: number;
}

export function WaveformPanel({
  title,
  colorVar,
  preview,
  loading,
  height = 200,
  flags = [],
  flagsActive = false,
  onFlagClick,
  onFlagRemove,
  onZoomSelect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);

  // El canvas se ajusta al ancho real del contenedor (no un ancho fijo) --
  // con varias vistas lado a lado el panel se angosta y un ancho fijo hacía
  // que la señal se saliera del recuadro.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.floor(w));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;

  const yDomain = useMemo(() => {
    if (!preview || preview.min.length === 0) return null;
    let lo = Math.min(...preview.min);
    let hi = Math.max(...preview.max);
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }, [preview]);

  // Convierte un índice de muestra a coordenada X del área de trazado,
  // relativo a la ventana visible actual de 'preview' (independiente del
  // número de buckets, para posicionar flags con precisión). null si el
  // punto no es visible en la ventana actual.
  function sampleToX(sampleIndex: number): number | null {
    if (!preview) return null;
    const range = preview.end_sample - preview.start_sample;
    if (range <= 0) return null;
    const fraction = (sampleIndex - preview.start_sample) / range;
    if (fraction < 0 || fraction > 1) return null;
    return PAD_LEFT + fraction * plotW;
  }

  // Inversa de sampleToX, sin recortar (para selección de zoom, que puede
  // arrastrarse ligeramente fuera del área de trazado).
  function xToSampleClamped(x: number): number | null {
    if (!preview) return null;
    const relative = (x - PAD_LEFT) / plotW;
    const clamped = Math.min(1, Math.max(0, relative));
    return Math.round(preview.start_sample + clamped * (preview.end_sample - preview.start_sample));
  }

  function sampleAtX(x: number): number | null {
    if (!preview) return null;
    const relative = (x - PAD_LEFT) / plotW;
    if (relative < 0 || relative > 1) return null;
    return Math.round(preview.start_sample + relative * (preview.end_sample - preview.start_sample));
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(canvas);
    const surface = style.getPropertyValue('--surface-1').trim();
    const gridline = style.getPropertyValue('--gridline').trim();
    const baselineColor = style.getPropertyValue('--baseline').trim();
    const muted = style.getPropertyValue('--text-muted').trim();
    const seriesColor = style.getPropertyValue(colorVar).trim();
    const flagColor = style.getPropertyValue('--flag-color').trim();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, height);

    if (!preview || preview.min.length === 0 || !yDomain) return;

    const n = preview.min.length;
    const xFor = (i: number) => PAD_LEFT + (i / Math.max(1, n - 1)) * plotW;
    const yFor = (v: number) =>
      PAD_TOP + (1 - (v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * plotH;

    if (yDomain.lo < 0 && yDomain.hi > 0) {
      ctx.strokeStyle = baselineColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const y0 = yFor(0);
      ctx.moveTo(PAD_LEFT, y0);
      ctx.lineTo(width - PAD_RIGHT, y0);
      ctx.stroke();
    } else {
      ctx.strokeStyle = gridline;
      ctx.lineWidth = 1;
      ctx.strokeRect(PAD_LEFT, PAD_TOP, plotW, plotH);
    }

    // envolvente min/max: marca primaria de este chart (no hay una línea
    // separada bajo la que este fill sea un wash secundario).
    ctx.fillStyle = seriesColor;
    ctx.beginPath();
    ctx.moveTo(xFor(0), yFor(preview.max[0]));
    for (let i = 1; i < n; i++) ctx.lineTo(xFor(i), yFor(preview.max[i]));
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(xFor(i), yFor(preview.min[i]));
    ctx.closePath();
    ctx.fill();

    // flags: marcador vertical + triángulo en la parte superior, color
    // distinto de las series (identidad de "anotación", no de datos).
    for (const sample of flags) {
      const x = sampleToX(sample);
      if (x === null) continue;
      ctx.strokeStyle = flagColor;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x, PAD_TOP);
      ctx.lineTo(x, height - PAD_BOTTOM);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = flagColor;
      ctx.beginPath();
      ctx.moveTo(x - 4, PAD_TOP);
      ctx.lineTo(x + 4, PAD_TOP);
      ctx.lineTo(x, PAD_TOP + 7);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = muted;
    ctx.font = '11px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${yDomain.hi.toFixed(0)} µV`, PAD_LEFT - 6, PAD_TOP);
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${yDomain.lo.toFixed(0)} µV`, PAD_LEFT - 6, height - PAD_BOTTOM + plotH);

    const t0 = preview.start_sample / preview.sampling_rate_hz;
    const t1 = preview.end_sample / preview.sampling_rate_hz;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${t0.toFixed(1)}s`, PAD_LEFT, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${t1.toFixed(1)}s`, width - PAD_RIGHT, height - 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, colorVar, height, width, plotW, plotH, yDomain, flags]);

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!preview) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setDragStartX(x);
    setDragCurrentX(x);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;

    if (dragStartX !== null) {
      setDragCurrentX(x);
      return; // durante el arrastre no se muestra el tooltip de hover
    }

    if (!preview || preview.min.length === 0) return;
    const sample = sampleAtX(x);
    if (sample === null) {
      setHover(null);
      return;
    }
    const n = preview.min.length;
    const relative = (x - PAD_LEFT) / plotW;
    const idx = Math.min(n - 1, Math.max(0, Math.round(relative * (n - 1))));
    setHover({
      x,
      timeSeconds: sample / preview.sampling_rate_hz,
      min: preview.min[idx],
      max: preview.max[idx],
    });
  }

  function handleSimpleClick(x: number) {
    if (!flagsActive) return;
    const clickSample = sampleAtX(x);
    if (clickSample === null) return;

    // Si el clic cae cerca de un flag ya existente, se quita ese flag en
    // vez de agregar uno nuevo encima (permite quitar flags uno por uno).
    for (const sample of flags) {
      const fx = sampleToX(sample);
      if (fx !== null && Math.abs(fx - x) <= FLAG_HIT_TOLERANCE_PX) {
        onFlagRemove?.(sample);
        return;
      }
    }
    onFlagClick?.(clickSample);
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragStartX === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const startX = dragStartX;
    setDragStartX(null);
    setDragCurrentX(null);

    if (Math.abs(endX - startX) < DRAG_THRESHOLD_PX) {
      handleSimpleClick(endX);
      return;
    }

    if (!preview || !onZoomSelect) return;
    const s1 = xToSampleClamped(Math.min(startX, endX));
    const s2 = xToSampleClamped(Math.max(startX, endX));
    if (s1 === null || s2 === null || s2 <= s1) return;
    onZoomSelect(s1 / preview.sampling_rate_hz, s2 / preview.sampling_rate_hz);
  }

  function handleMouseLeave() {
    setHover(null);
    setDragStartX(null);
    setDragCurrentX(null);
  }

  return (
    <div className="waveform-panel">
      <div className="waveform-panel-header">
        <span className="waveform-panel-title">{title}</span>
        {preview && <span className="muted">{preview.channel_label}</span>}
      </div>
      <div className="waveform-canvas-wrap" style={{ height }} ref={wrapRef}>
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className={flagsActive ? 'flag-cursor' : undefined}
        />
        {loading && <div className="waveform-overlay">Cargando…</div>}
        {!loading && !preview && <div className="waveform-overlay muted">Sin datos</div>}
        {!loading && preview && preview.min.length === 0 && (
          <div className="waveform-overlay muted">
            Fuera del rango de este dataset (dura {(preview.end_sample / preview.sampling_rate_hz).toFixed(1)}s) — usa Inicio para restablecer el zoom.
          </div>
        )}
        {dragStartX !== null && dragCurrentX !== null && (
          <div
            className="zoom-select-box"
            style={{
              left: Math.min(dragStartX, dragCurrentX),
              width: Math.abs(dragCurrentX - dragStartX),
              top: PAD_TOP,
              bottom: PAD_BOTTOM,
            }}
          />
        )}
        {hover && dragStartX === null && (
          <>
            <div className="crosshair-line" style={{ left: hover.x }} />
            <div className="crosshair-tooltip" style={{ left: Math.min(hover.x + 10, width - 150) }}>
              <div>t = {hover.timeSeconds.toFixed(2)}s</div>
              <div>
                {hover.min.toFixed(2)} … {hover.max.toFixed(2)} µV
              </div>
            </div>
          </>
        )}
      </div>
      <p className="waveform-hint muted">
        Arrastra para hacer zoom sobre un rango
        {flagsActive ? ' · clic para marcar/quitar un flag' : ''}.
      </p>
    </div>
  );
}
