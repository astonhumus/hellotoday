import type { Category } from "../../types";
import { Icon } from "../../ui/Icon";
import { Chip } from "../../ui/Chip";

interface Props {
  q: string;
  onQuery: (q: string) => void;
  categories: Category[];                 // only those that have places
  counts: Record<string, number>;
  picked: Set<string>;                    // empty = all
  onToggleCategory: (id: string) => void;
  onAllCategories: () => void;
  districts: string[];
  district: string;
  onDistrict: (d: string) => void;
  visitedOnly: boolean;
  onVisitedOnly: () => void;
  visitedCount: number;
}

/** Search box plus one scrolling row of filters. On phones it floats over the map; on larger screens it heads the side panel. */
export function FilterBar(p: Props) {
  return (
    <div className="fb">
      <label className="fb-search">
        <Icon name="search" size={18} />
        <input type="search" value={p.q} onChange={e => p.onQuery(e.target.value)} placeholder="Search places" aria-label="Search places" enterKeyHint="search" />
        {p.q && <button type="button" className="fb-clear" aria-label="Clear search" onClick={() => p.onQuery("")}><Icon name="x" size={16} /></button>}
      </label>
      <div className="fb-chips" role="group" aria-label="Filters">
        <Chip pressed={p.picked.size === 0 && !p.visitedOnly} onClick={() => { p.onAllCategories(); if (p.visitedOnly) p.onVisitedOnly(); }}>All</Chip>
        <Chip pressed={p.visitedOnly} count={p.visitedCount || undefined} onClick={p.onVisitedOnly}>✓ My visited</Chip>
        {p.categories.map(c => (
          <Chip key={c.id} pressed={p.picked.has(c.id)} dotColor={c.color} count={p.counts[c.id]} onClick={() => p.onToggleCategory(c.id)}>{c.label}</Chip>
        ))}
        <select className="fb-district" value={p.district} onChange={e => p.onDistrict(e.target.value)} aria-label="Filter by district" data-active={p.district !== "all"}>
          <option value="all">All districts</option>
          {p.districts.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
    </div>
  );
}
