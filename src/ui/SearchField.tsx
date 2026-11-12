import { useId, useState } from "react";
import { Icon } from "./Icon";
import { store } from "../lib/data";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label?: string;
  className?: string;
  recentKey?: string;      // remember what was searched under this name (on this device) and offer it again
  suggestions?: string[];  // other words worth offering, e.g. category and district names
  onFocus?: () => void;
}

const readRecent = (key: string): string[] => {
  try { const v = JSON.parse(store.get("recent:" + key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};

/** Remembers a search that led somewhere (Enter pressed, or a result opened), not every half-typed word. */
export function rememberRecent(key: string, text: string) {
  const v = text.trim();
  if (v.length < 2) return;
  store.set("recent:" + key, JSON.stringify([v, ...readRecent(key).filter(r => r.toLowerCase() !== v.toLowerCase())].slice(0, 6)));
}

/** The rounded search box used across the app, with optional recent searches and suggestions (the browser's own list). */
export function SearchField({ value, onChange, placeholder, label, className = "", recentKey, suggestions = [], onFocus }: Props) {
  const listId = useId();
  const [recent, setRecent] = useState<string[]>(() => (recentKey ? readRecent(recentKey) : []));
  const remember = () => { if (recentKey) { rememberRecent(recentKey, value); setRecent(readRecent(recentKey)); } };
  const options = [...new Set([...recent, ...suggestions])];
  return (
    <label className={`search-field ${className}`}>
      <Icon name="search" size={18} />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        aria-label={label ?? placeholder} enterKeyHint="search" list={options.length ? listId : undefined}
        onFocus={() => { if (recentKey) setRecent(readRecent(recentKey)); onFocus?.(); }} onKeyDown={e => { if (e.key === "Enter") remember(); }} />
      {options.length > 0 && <datalist id={listId}>{options.map(o => <option key={o} value={o} />)}</datalist>}
      {value && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => onChange("")}><Icon name="x" size={16} /></button>}
    </label>
  );
}
