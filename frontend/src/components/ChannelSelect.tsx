interface Props {
  labels: string[];
  value: number;
  onChange: (channel: number) => void;
}

export function ChannelSelect({ labels, value, onChange }: Props) {
  return (
    <section className="panel">
      <h2 className="panel-title">Canal</h2>
      <select
        className="select"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {labels.map((label, idx) => (
          <option key={idx} value={idx}>
            {idx}. {label}
          </option>
        ))}
      </select>
    </section>
  );
}
