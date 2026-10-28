import { useEffect, useMemo, useState } from "react";
import type { Category, Place, StateInfo } from "../../types";
import { confirmAsk } from "../../lib/ui";
import { useVisited } from "../../lib/visited";
import { FooterLinks } from "../../components/AboutPage";
import { Button, IconButton } from "../../ui/Button";
import { Sheet, type Snap } from "../../ui/Sheet";
import { useMedia } from "../../ui/useMedia";
import { MapView } from "./MapView";
import { AddPlaceDialog } from "./AddPlaceDialog";
import { FilterBar } from "./FilterBar";
import { PlaceCard } from "./PlaceCard";
import { PlaceDetails } from "./PlaceDetails";
import "./places.css";

interface Props {
  state: StateInfo;
  categories: Category[];
  places: Place[];
  localIds: Set<string>;
  admin: boolean;
  canDelete: boolean;
  loading?: boolean;
  onSavePlace: (p: Omit<Place, "id">, id?: string) => void;
  onDeletePlace: (id: string) => void;
  exportCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
}

const FILTER_BAR_HEIGHT = 124; // px the floating search and filters take at the top of the map on phones

export function PlacesPage({ state, categories, places, admin, canDelete, loading, onSavePlace, onDeletePlace, exportCount, onExport, onImport }: Props) {
  const phone = useMedia("(max-width: 760px)");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // empty = all categories
  const [district, setDistrict] = useState("all");
  const [q, setQ] = useState("");
  const [visitedOnly, setVisitedOnly] = useState(false);
  const mine = useVisited();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const [snap, setSnap] = useState<Snap>("peek");
  const [sheetH, setSheetH] = useState(84);
  const [dialog, setDialog] = useState<{ editing: Place | null } | null>(null);

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    places.forEach(p => { m[p.category] = (m[p.category] ?? 0) + 1; });
    return m;
  }, [places]);
  const districts = useMemo(() => [...new Set(places.map(p => p.district).filter(Boolean) as string[])].sort(), [places]);
  const visibleCats = categories.filter(c => counts[c.id]);
  const visitedIds = useMemo(() => new Set(Object.keys(mine.visited)), [mine.visited]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return places
      .filter(p => (!picked.size || picked.has(p.category)) &&
        (district === "all" || p.district === district) &&
        (!visitedOnly || visitedIds.has(p.id)) &&
        (!needle || [p.name, p.desc, p.district, p.notes].join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [places, picked, district, q, visitedOnly, visitedIds]);

  const selected = selectedId ? places.find(p => p.id === selectedId) ?? null : null;

  const toggleCategory = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // On phones the list sits low over the map; searching or filtering brings it up so results are visible.
  useEffect(() => { if (phone && q && snap === "peek" && !selected) setSnap("half"); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (id: string) => {
    setSelectedId(id);
    setFocusTick(n => n + 1);
    if (phone) setSnap(s => (s === "full" ? "half" : s === "peek" ? "half" : s));
  };
  const remove = async (p: Place) => {
    if (await confirmAsk(`Delete "${p.name}"?`, { yes: "Delete", danger: true })) { onDeletePlace(p.id); setSelectedId(null); }
  };

  const adminTools = admin && (
    <div className="pl-tools">
      <Button variant="primary" icon="plus" onClick={() => setDialog({ editing: null })}>Add place</Button>
      <Button onClick={onExport} disabled={!exportCount}>Export ({exportCount})</Button>
      <label className="btn file">Import
        <input type="file" accept=".json,application/json" hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
      </label>
    </div>
  );

  const list = (
    <>
      {adminTools}
      <ul className="pl-list">
        {filtered.length === 0 && (
          <li className="empty">{visitedOnly && !mine.count ? "You haven't marked any places yet. Tick a place and it will appear here." : "No places match your filters."}</li>
        )}
        {filtered.map(p => (
          <PlaceCard key={p.id} place={p} category={catById[p.category]} active={p.id === selectedId}
            visited={mine.has(p.id)} onOpen={() => open(p.id)} onToggleVisited={() => mine.toggle(p.id)} />
        ))}
      </ul>
      <FooterLinks />
    </>
  );

  const details = selected && (
    <PlaceDetails place={selected} category={catById[selected.category]} visited={mine.has(selected.id)} visitedOn={mine.when(selected.id)}
      onToggleVisited={() => mine.toggle(selected.id)} admin={admin} canDelete={canDelete}
      onEdit={() => setDialog({ editing: selected })} onDelete={() => remove(selected)} />
  );

  const filterBar = (
    <FilterBar q={q} onQuery={setQ} categories={visibleCats} counts={counts} picked={picked} onToggleCategory={toggleCategory}
      onAllCategories={() => setPicked(new Set())} districts={districts} district={district} onDistrict={setDistrict}
      visitedOnly={visitedOnly} onVisitedOnly={() => setVisitedOnly(v => !v)} visitedCount={mine.count} />
  );

  const title = selected
    ? <><IconButton icon="back" label="Back to the list" onClick={() => setSelectedId(null)} /><strong className="pl-title">{selected.name}</strong></>
    : <strong className="pl-title">{filtered.length} place{filtered.length === 1 ? "" : "s"}{loading ? " · updating…" : ""}</strong>;

  return (
    <div className="places" style={{ "--sheet-h": `${phone ? sheetH : 0}px` } as React.CSSProperties}>
      <div className="map-wrap">
        <MapView state={state} places={filtered} categories={catById} selectedId={selected?.id ?? null} focusTick={focusTick}
          visitedIds={visitedIds} insets={phone ? { top: FILTER_BAR_HEIGHT, bottom: sheetH } : { top: 0, bottom: 0 }} onSelect={open} />
      </div>

      {phone ? (
        <>
          <div className="pl-float">{filterBar}</div>
          <Sheet snap={snap} onSnap={setSnap} head={title} topGap={FILTER_BAR_HEIGHT} onHeight={setSheetH} label="Places">
            {details ?? list}
          </Sheet>
        </>
      ) : (
        <aside className="pl-side">
          {filterBar}
          <div className="pl-side-head">{title}</div>
          <div className="pl-side-body">{details ?? list}</div>
        </aside>
      )}

      {dialog && (
        <AddPlaceDialog categories={categories} districts={districts} editing={dialog.editing}
          onSave={(p, id) => { onSavePlace(p, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
