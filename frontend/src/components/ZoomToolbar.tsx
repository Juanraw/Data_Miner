interface Props {
  flagsActive: boolean;
  onToggleFlags: () => void;
  flagCount: number;
  onClearFlags: () => void;
  onAddView: () => void;
}

// Zoom/pan/home viven ahora dentro de cada ViewPanel (independientes por
// vista) -- esta barra solo agrupa lo que sigue siendo global: flags y
// añadir vistas.
export function ZoomToolbar({ flagsActive, onToggleFlags, flagCount, onClearFlags, onAddView }: Props) {
  return (
    <div className="toolbar">
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
