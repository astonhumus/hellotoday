import { useEffect, useMemo, useState } from "react";
import type { Category, Place, StateInfo } from "../../types";
import { confirmAsk, notify } from "../../lib/ui";
import { useVisited } from "../../lib/visited";
import { FooterLinks } from "../../components/AboutPage";
import { Button, IconButton } from "../../ui/Button";
import { Sheet, type Snap } from "../../ui/Sheet";
import { useMedia } from "../../ui/useMedia";
import { useChipFilter } from "../../ui/useChipFilter";
import { usePageMeta } from "../../lib/pageMeta";
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
  initial?: { cat: string | null; q: string; visited: boolean; near: boolean }; // from the address, e.g. #/places?cat=picnic
  onSavePlace: (p: Omit<Place, "id">, id?: string) => void;
  onDeletePlace: (id: string) => void;
  exportCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
}

// Straight-line distance in km (good enough for "which is closest")
const km = (from: { lat: number; lng: number }, p: Place) => {
  const rad = (d: number) => (d * Math.PI) / 180, dLat = rad(p.lat - from.lat), dLng = rad(p.lng - from.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(p.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

const FILTER_BAR_HEIGHT = 124; // px the floating search and filters take at the top of the map on phones

export function PlacesPage({ initial, state, categories, places, admin, canDelete, loading, onSavePlace, onDeletePlace, exportCount, onExport, onImport }: Props) {
  const phone = useMedia("(max-width: 760px)");
  const { picked, toggle: toggleCategory, clear: clearCategories, multi, setMulti } = useChipFilter(initial?.cat ? [initial.cat] : []); // single-select unless "Select several" is on
  const [district, setDistrict] = useState("all");
  const [q, setQ] = useState(initial?.q ?? "");
  const [visitedOnly, setVisitedOnly] = useState(!!initial?.visited);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null); // set while "Near me" is on
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

  // "Near me": ask the phone where it is, then sort by distance. Nothing is sent anywhere.
  const askLocation = () => {
    if (!navigator.geolocation) return void notify("This device can't share its location.", "error");
    navigator.geolocation.getCurrentPosition(
      pos => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => void notify("Couldn't get your location. Allow location access for this site in your browser settings, then try again.", "error"),
      { timeout: 12000, maximumAge: 60000 });
  };
  const toggleNear = () => (me ? setMe(null) : askLocation());
  useEffect(() => { if (initial?.near) askLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return places
      .filter(p => (!picked.size || picked.has(p.category)) &&
        (district === "all" || p.district === district) &&
        (!visitedOnly || visitedIds.has(p.id)) &&
        (!needle || [p.name, p.desc, p.district, p.notes].join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => (me ? km(me, a) - km(me, b) : a.name.localeCompare(b.name)));
  }, [places, picked, district, q, visitedOnly, visitedIds, me]);

  const pickedCat = picked.size === 1 ? categories.find(c => c.id === [...picked][0]) : undefined;
  const selected = selectedId ? places.find(p => p.id === selectedId) ?? null : null;

  // On phones the list sits low over the map; searching or filtering brings it up so results are visible.
  useEffect(() => { if (phone && q && snap === "peek" && !selected) setSnap("half"); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  usePageMeta(
    selected ? `${selected.name}${selected.district ? `, ${selected.district}` : ""}: ${catById[selected.category]?.label ?? "place"} in ${state.name}`
      : `${pickedCat?.label ?? "Places"} in ${state.name}: map and directions`,
    selected ? `${selected.desc ?? `${selected.name} in ${selected.district ?? state.name}.`} Directions, coordinates and distance.`.slice(0, 158)
      : `Browse ${pickedCat ? pickedCat.label.toLowerCase() : "tourist sites, picnic spots, snack stalls, hotels and resorts"} in ${state.name} on a map, with district boundaries, search and directions.`);

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
            visited={mine.has(p.id)} distanceKm={me ? km(me, p) : undefined} onOpen={() => open(p.id)} onToggleVisited={() => mine.toggle(p.id)} />
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
      onAllCategories={clearCategories} multi={multi} onMulti={setMulti} districts={districts} district={district} onDistrict={setDistrict}
      visitedOnly={visitedOnly} onVisitedOnly={() => setVisitedOnly(v => !v)} visitedCount={mine.count}
      near={!!me} onNear={toggleNear} />
  );

  const title = selected
    ? <><IconButton icon="back" label="Back to the list" onClick={() => setSelectedId(null)} /><h2 className="pl-title">{selected.name}</h2></>
    : <strong className="pl-title">{filtered.length} place{filtered.length === 1 ? "" : "s"}{loading ? " · updating…" : ""}</strong>;

  return (
    <div className="places" style={{ "--sheet-h": `${phone ? sheetH : 0}px` } as React.CSSProperties}>
      <h1 className="sr-only">Places to visit in {state.name}</h1>
      <div className="map-wrap">
        <MapView state={state} places={filtered} categories={catById} selectedId={selected?.id ?? null} focusTick={focusTick}
          visitedIds={visitedIds} me={me} insets={phone ? { top: FILTER_BAR_HEIGHT, bottom: sheetH } : { top: 0, bottom: 0 }} onSelect={open} />
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
