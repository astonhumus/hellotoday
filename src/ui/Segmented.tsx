interface Option<T extends string> { id: T; label: string }

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: Option<T>[];
  label: string; // accessible name for the group
}

/** A two or three way switch, e.g. "1. Choose items | 2. My list". */
export function Segmented<T extends string>({ value, onChange, options, label }: Props<T>) {
  return (
    <div className="seg-ctl" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" className="seg-btn" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
