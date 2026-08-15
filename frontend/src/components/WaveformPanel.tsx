import { useEffect, useMemo, useRef, useState } from 'react';
import type { PreviewResponse } from '../api';

export interface SeriesDisplay {
  key: string;
  label: string;
  colorVar: string; // ej. "--series-1"
  preview: PreviewResponse | null;
}

export interface TimeRange {
  start: number;
  end: number;
}

interface Props {
  title: string;
  series: SeriesDisplay[];
  timeRange: TimeRange;
  loading?: boolean;
  height?: number;
  flagTimes?: number[]; // segundos, ya resueltos por el padre (puede combinar varios datasets)
  flagsActive?: boolean;
  onFlagClick?: (timeSeconds: number) => void;
  onFlagRemove?: (timeSeconds: number) => void;
  onZoomSelect?: (startSeconds: number, endSeconds: number) => void;
  onWheelPan?: (direction: 1 | -1) => void;
}

const PAD_LEFT = 52;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;
const DRAG_THRESHOLD_PX = 5;
const FLAG_HIT_TOLERANCE_PX = 6;

interface HoverValue {
  label: string;
  colorVar: string;
  min: number;
  max: number;
}

interface HoverInfo {
  x: number;
  timeSeconds: number;
  values: HoverValue[];
}

export function WaveformPanel({
  title,
  series,
  timeRange,
  loading,
  height = 200,
  flagTimes = [],
  flagsActive = false,
  onFlagClick,
  onFlagRemove,
  onZoomSelect,
  onWheelPan,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [dragStartX, setDragStartX] = useState<number | null>(null);
  const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);
  const wheelAccumRef = useRef(0);
  const wheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onWheelPan) return;
    function handleNativeWheel(e: WheelEvent) {
      e.preventDefault();
      wheelAccumRef.current += e.deltaY;
      if (wheelTimerRef.current) return;
      wheelTimerRef.current = setTimeout(() => {
        const total = wheelAccumRef.current;
        wheelAccumRef.current = 0;
        wheelTimerRef.current = null;
        if (total !== 0) onWheelPan!(total > 0 ? 1 : -1);
      }, 60);
    }
    canvas.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleNativeWheel);
  }, [onWheelPan]);

  const plotW = width - PAD_LEFT - PAD_RIGHT;
  const plotH = height - PAD_TOP - PAD_BOTTOM;

  const validSeries = useMemo(
    () => series.filter((s): s is SeriesDisplay & { preview: PreviewResponse } => !!s.preview && s.preview.min.length > 0),
    [series],
  );

  const yDomain = useMemo(() => {
    if (validSeries.length === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of validSeries) {
      lo = Math.min(lo, Math.min(...s.preview.min));
      hi = Math.max(hi, Math.max(...s.preview.max));
    }
    if (lo === hi) {
      lo -= 1;
      hi += 1;
    }
    const pad = (hi - lo) * 0.08;
    return { lo: lo - pad, hi: hi + pad };
  }, [validSeries]);

  const timeSpan = timeRange.end - timeRange.start;

  function xForTime(t: number): number {
    if (timeSpan <= 0) return PAD_LEFT;
    return PAD_LEFT + ((t - timeRange.start) / timeSpan) * plotW;
  }

  function timeAtX(x: number): number {
    const relative = (x - PAD_LEFT) / plotW;
    return timeRange.start + relative * timeSpan;
  }

  function timeAtXClamped(x: number): number {
    const relative = Math.min(1, Math.max(0, (x - PAD_LEFT) / plotW));
    return timeRange.start + relative * timeSpan;
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
    const flagColor = style.getPropertyValue('--flag-color').trim();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, height);

    if (validSeries.length === 0 || !yDomain) return;

    const yFor = (v: number) => PAD_TOP + (1 - (v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * plotH;

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

    // Con una sola serie el fill va a opacidad plena (es la marca primaria,
    // no un wash bajo una línea). Con 2+ superpuestas, opacidad parcial para
    // que las zonas de solapamiento sigan siendo legibles.
    const fillAlpha = validSeries.length > 1 ? 0.62 : 1;
    ctx.globalAlpha = fillAlpha;
    for (const s of validSeries) {
      const preview = s.preview;
      const n = preview.min.length;
      const timeAt = (i: number) => (preview.start_sample + i * preview.bucket_samples) / preview.sampling_rate_hz;

      ctx.fillStyle = style.getPropertyValue(s.colorVar).trim();
      ctx.beginPath();
      ctx.moveTo(xForTime(timeAt(0)), yFor(preview.max[0]));
      for (let i = 1; i < n; i++) ctx.lineTo(xForTime(timeAt(i)), yFor(preview.max[i]));
      for (let i = n - 1; i >= 0; i--) ctx.lineTo(xForTime(timeAt(i)), yFor(preview.min[i]));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // flags: marcador vertical + triángulo, color de anotación (distinto de
    // las series por trazo punteado, no solo por hue).
    for (const t of flagTimes) {
      const x = xForTime(t);
      if (x < PAD_LEFT || x > width - PAD_RIGHT) continue;
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

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`${timeRange.start.toFixed(1)}s`, PAD_LEFT, height - 6);
    ctx.textAlign = 'right';
    ctx.fillText(`${timeRange.end.toFixed(1)}s`, width - PAD_RIGHT, height - 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validSeries, yDomain, timeRange, height, width, plotW, plotH, flagTimes]);

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (validSeries.length === 0) return;
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
      return;
    }

    if (validSeries.length === 0 || x < PAD_LEFT || x > width - PAD_RIGHT) {
      setHover(null);
      return;
    }

    const t = timeAtX(x);
    const values: HoverValue[] = validSeries.map((s) => {
      const preview = s.preview;
      const n = preview.min.length;
      const bucketDuration = preview.bucket_samples / preview.sampling_rate_hz;
      const t0 = preview.start_sample / preview.sampling_rate_hz;
      const idx = Math.min(n - 1, Math.max(0, Math.round((t - t0) / (bucketDuration || 1))));
      return { label: s.label, colorVar: s.colorVar, min: preview.min[idx], max: preview.max[idx] };
    });
    setHover({ x, timeSeconds: t, values });
  }

  function handleSimpleClick(x: number) {
    if (!flagsActive) return;
    const clickTime = timeAtXClamped(x);

    for (const t of flagTimes) {
      const fx = xForTime(t);
      if (Math.abs(fx - x) <= FLAG_HIT_TOLERANCE_PX) {
        onFlagRemove?.(t);
        return;
      }
    }
    onFlagClick?.(clickTime);
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

    if (!onZoomSelect) return;
    const t1 = timeAtXClamped(Math.min(startX, endX));
    const t2 = timeAtXClamped(Math.max(startX, endX));
    if (t2 <= t1) return;
    onZoomSelect(t1, t2);
  }

  function handleMouseLeave() {
    setHover(null);
    setDragStartX(null);
    setDragCurrentX(null);
  }

  return (
    <div className="waveform-panel">
      {title && (
        <div className="waveform-panel-header">
          <span className="waveform-panel-title">{title}</span>
        </div>
      )}
      {series.length > 1 && (
        <div className="series-legend">
          {series.map((s) => (
            <span key={s.key} className="series-legend-item">
              <span className="series-swatch" style={{ background: `var(${s.colorVar})` }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
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
        {!loading && series.length === 0 && <div className="waveform-overlay muted">Sin datos</div>}
        {!loading && series.length > 0 && validSeries.length === 0 && (
          <div className="waveform-overlay muted">
            Fuera del rango de al menos una señal — usa Inicio para restablecer el zoom.
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
            <div className="crosshair-tooltip" style={{ left: Math.min(hover.x + 10, width - 170) }}>
              <div>t = {hover.timeSeconds.toFixed(2)}s</div>
              {hover.values.map((v, i) => (
                <div key={i} className="crosshair-tooltip-series">
                  <span className="series-swatch" style={{ background: `var(${v.colorVar})` }} />
                  {series.length > 1 ? `${v.label}: ` : ''}
                  {v.min.toFixed(2)} … {v.max.toFixed(2)} µV
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <p className="waveform-hint muted">
        Arrastra para hacer zoom · rueda del mouse para avanzar/retroceder
        {flagsActive ? ' · clic para marcar/quitar un flag' : ''}.
      </p>
    </div>
  );
}
