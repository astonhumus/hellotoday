import { Icon } from "./Icon";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
}

/** The rounded search box used across the app. */
export function SearchField({ value, onChange, placeholder, label, className = "" }: Props) {
  return (
    <label className={`search-field ${className}`}>
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label ?? placeholder} enterKeyHint="search" />
      {value && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange("")}><Icon name="x" size={16} /></button>}
    </label>
  );
}
