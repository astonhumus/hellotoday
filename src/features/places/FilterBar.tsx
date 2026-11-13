import { useState } from "react";
import type { Category } from "../../types";
import { Chip } from "../../ui/Chip";
import { SearchField } from "../../ui/SearchField";

interface Props {
  q: string;
  onQuery: (q: string) => void;
  categories: Category[];
  counts: Record<string, number>;
  picked: Set<string>;                    // empty = all
  onToggleCategory: (id: string) => void;
  onAllCategories: () => void;
  allOn: boolean;                         // "All" is on: every place is pinned on the map
  onAll: () => void;
  districts: string[];
  district: string;
  onDistrict: (d: string) => void;
  visitedOnly: boolean;
  onVisitedOnly: () => void;
  visitedCount: number;
  closedOnly?: boolean;                   // admin / contributor: only closed and archived places
  onClosedOnly?: () => void;              // undefined = not available (visitors)
  closedCount?: number;
  tripOnly: boolean;                      // only the places in "My trip"
  onTripOnly: () => void;
  tripCount: number;
  onSearchFocus?: () => void;             // phones: the list rises so results stay above the keyboard
  favOnly: boolean;
  onFavOnly: () => void;
  favCount: number;
  allRegions?: boolean;                   // places from every region are shown, not just the chosen one
  onAllRegions?: () => void;              // undefined = not available (no database)
  compact?: boolean;                      // only the search box (the sidebar is showing a place's details)
  near: boolean;
  onNear: () => void;
  filtering: boolean;                     // any filter or search is active
  onReset: () => void;
}

/**
 * Search box, then one scrolling row: Filters, Favourites, All and the categories (tap several to combine).
 * The less common filters (district, visited, near me) sit behind the "Filters" button so the row stays short.
 */
export function FilterBar(p: Props) {
  const [open, setOpen] = useState(false);
  const extra = (p.district !== "all" ? 1 : 0) + (p.visitedOnly ? 1 : 0) + (p.near ? 1 : 0) + (p.allRegions ? 1 : 0) + (p.closedOnly ? 1 : 0) + (p.tripOnly ? 1 : 0);
  return (
    <div className="fb">
      <SearchField className="fb-search" value={p.q} onChange={p.onQuery} placeholder="Search places or areas" recentKey="places" onFocus={p.onSearchFocus}
        suggestions={[...p.categories.map(c => c.label), ...p.districts]} />
      {!p.compact && <div className="fb-chips" role="group" aria-label="Categories">
        {/* Reset comes first so it is never lost off the end of a scrolling row */}
        {p.filtering && <Chip pressed={false} icon="x" className="reset-chip" onClick={p.onReset}>Reset</Chip>}
        <Chip pressed={open || extra > 0} icon="sliders" count={extra || undefined} aria-expanded={open} aria-controls="fb-more" onClick={() => setOpen(o => !o)}>Filters</Chip>
        <Chip pressed={p.favOnly} icon="heart" className="fav-chip" count={p.favCount || undefined} onClick={p.onFavOnly} title="Show only your favourites" aria-label="Favourites only"><span className="sr-only">Favourites</span></Chip>
        <Chip pressed={p.allOn} onClick={p.onAll} title="Show every place on the map">All</Chip>
        {p.categories.map(c => (
          <Chip key={c.id} pressed={p.picked.has(c.id)} icon={c.icon} iconColor={c.color} count={p.counts[c.id]} onClick={() => p.onToggleCategory(c.id)}>{c.label}</Chip>
        ))}
      </div>}
      {open && !p.compact && (
        <div className="fb-more" id="fb-more">
          {p.onAllRegions && <Chip pressed={!!p.allRegions} icon="map" onClick={p.onAllRegions} title="Show places from every country and state, not just the chosen region">All regions</Chip>}
          {p.onClosedOnly && <Chip pressed={!!p.closedOnly} icon="circle-x" count={p.closedCount || undefined} onClick={p.onClosedOnly} title="Only closed and archived places, so you can review or reopen them">Closed / archived</Chip>}
          <Chip pressed={p.near} icon="pin" onClick={p.onNear} title="Sort by distance from where you are">Near me</Chip>
          <Chip pressed={p.tripOnly} count={p.tripCount || undefined} icon="route" onClick={p.onTripOnly} title="Only the places you picked for your trip">My trip</Chip>
          <Chip pressed={p.visitedOnly} count={p.visitedCount || undefined} icon="check" onClick={p.onVisitedOnly}>My visited</Chip>
          <select className="pill-select" value={p.district} onChange={e => p.onDistrict(e.target.value)} aria-label="Filter by district" data-active={p.district !== "all"}>
            <option value="all">All districts</option>
            {p.districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
