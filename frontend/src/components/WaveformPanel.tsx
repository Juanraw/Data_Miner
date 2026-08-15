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
}

const WIDTH = 820;
const PAD_LEFT = 52;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

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
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
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
  // número de buckets, para posicionar flags con precisión).
  function sampleToX(sampleIndex: number): number | null {
    if (!preview) return null;
    const range = preview.end_sample - preview.start_sample;
    if (range <= 0) return null;
    const fraction = (sampleIndex - preview.start_sample) / range;
    if (fraction < 0 || fraction > 1) return null;
    return PAD_LEFT + fraction * plotW;
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = WIDTH * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${WIDTH}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(canvas);
    const surface = style.getPropertyValue('--surface-1').trim();
    const gridline = style.getPropertyValue('--gridline').trim();
    const baselineColor = style.getPropertyValue('--baseline').trim();
    const muted = style.getPropertyValue('--text-muted').trim();
    const seriesColor = style.getPropertyValue(colorVar).trim();
    const flagColor = style.getPropertyValue('--flag-color').trim();

    ctx.clearRect(0, 0, WIDTH, height);
    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, WIDTH, height);

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
      ctx.lineTo(WIDTH - PAD_RIGHT, y0);
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
    ctx.fillText(`${t1.toFixed(1)}s`, WIDTH - PAD_RIGHT, height - 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, colorVar, height, plotW, plotH, yDomain, flags]);

  function sampleAtX(x: number): number | null {
    if (!preview) return null;
    const relative = (x - PAD_LEFT) / plotW;
    if (relative < 0 || relative > 1) return null;
    return Math.round(preview.start_sample + relative * (preview.end_sample - preview.start_sample));
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!preview || preview.min.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
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

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!flagsActive || !onFlagClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sample = sampleAtX(e.clientX - rect.left);
    if (sample !== null) onFlagClick(sample);
  }

  return (
    <div className="waveform-panel">
      <div className="waveform-panel-header">
        <span className="waveform-panel-title">{title}</span>
        {preview && <span className="muted">{preview.channel_label}</span>}
      </div>
      <div className="waveform-canvas-wrap" style={{ height }}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          onClick={handleClick}
          className={flagsActive ? 'flag-cursor' : undefined}
        />
        {loading && <div className="waveform-overlay">Cargando…</div>}
        {!loading && !preview && <div className="waveform-overlay muted">Sin datos</div>}
        {hover && (
          <>
            <div className="crosshair-line" style={{ left: hover.x }} />
            <div className="crosshair-tooltip" style={{ left: Math.min(hover.x + 10, WIDTH - 150) }}>
              <div>t = {hover.timeSeconds.toFixed(2)}s</div>
              <div>
                {hover.min.toFixed(2)} … {hover.max.toFixed(2)} µV
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
