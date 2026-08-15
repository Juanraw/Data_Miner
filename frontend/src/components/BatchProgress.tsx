import type { BatchItemStatus } from '../api';

interface Props {
  items: BatchItemStatus[];
}

const STATUS_LABEL: Record<BatchItemStatus['status'], string> = {
  pending: 'En cola',
  running: 'Procesando…',
  done: 'Listo',
  error: 'Error',
};

export function BatchProgress({ items }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Lote</h2>
      <ul className="batch-list">
        {items.map((item) => (
          <li key={item.dataset_id} className={`batch-item batch-item--${item.status}`}>
            <span className="batch-item-name">{item.dataset_id.split('/').pop()}</span>
            <span className="batch-item-status">
              {item.status === 'done' && item.compute_time_ms !== undefined
                ? `${STATUS_LABEL.done} (${item.compute_time_ms}ms)`
                : item.status === 'error'
                  ? item.error ?? STATUS_LABEL.error
                  : STATUS_LABEL[item.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
