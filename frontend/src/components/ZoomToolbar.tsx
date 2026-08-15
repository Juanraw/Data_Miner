interface Props {
  hasViewport: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onPanLeft: () => void;
  onPanRight: () => void;
  onHome: () => void;
  flagsActive: boolean;
  onToggleFlags: () => void;
  flagCount: number;
  onClearFlags: () => void;
  onAddView: () => void;
}

export function ZoomToolbar({
  hasViewport,
  onZoomIn,
  onZoomOut,
  onPanLeft,
  onPanRight,
  onHome,
  flagsActive,
  onToggleFlags,
  flagCount,
  onClearFlags,
  onAddView,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
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
      <div className="toolbar-group">
        <button
          className={`button-toggle${flagsActive ? ' active' : ''}`}
          onClick={onToggleFlags}
          title="Clic en una señal para marcar un punto de interés"
        >
          🚩 Flags{flagsActive ? ' (activo)' : ''}
        </button>
        {flagCount > 0 && (
          <button className="button-icon" onClick={onClearFlags} title="Quitar todos los flags">
            Limpiar ({flagCount})
          </button>
        )}
      </div>
      <div className="toolbar-group">
        <button className="button-icon" onClick={onAddView} title="Añadir otra vista para comparar">
          + Vista
        </button>
      </div>
    </div>
  );
}
