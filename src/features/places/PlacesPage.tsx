import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { Category, Place, StateInfo } from "../../types";
import { confirmAsk, notify } from "../../lib/ui";
import { useVisited } from "../../lib/visited";
import { FooterLinks } from "../../components/AboutPage";
import { Button, IconButton } from "../../ui/Button";
import { Sheet, type Snap } from "../../ui/Sheet";
import { useMedia } from "../../ui/useMedia";
import { useChipFilter } from "../../ui/useChipFilter";
import { usePageMeta } from "../../lib/pageMeta";
import { distanceKm } from "../../lib/geo";
import { canGoBack, goBack } from "../../lib/nav";
import { MapView } from "./MapView";
import { CategoryManager } from "./CategoryManager";
import { AddPlaceDialog } from "./AddPlaceDialog";
import { FilterBar } from "./FilterBar";
import { PlaceCard } from "./PlaceCard";
import { PlaceDetails } from "./PlaceDetails";
import { EmptyState, Skeleton } from "../../ui/States";
import "./places.css";

interface Props {
  state: StateInfo;
  categories: Category[];
  places: Place[];
  localIds: Set<string>;
  admin: boolean;
  canDelete: boolean;
  onSaveCategory?: (c: Omit<Category, "id">, id?: string) => void; // set only for the admin
  onDeleteCategory?: (id: string) => void;
  categoryUsage?: (id: string) => Promise<number>;
  loading?: boolean;
  ready?: boolean; // this state's places have arrived (or failed); until then the list shows placeholders
  initial?: { cat: string | null; q: string; visited: boolean; near: boolean }; // from the address, e.g. #/places?cat=picnic
  queryKey?: string;                 // changes when the address's filters change, so they are applied without rebuilding the map
  placeId?: string | null;           // the open place, from the address (#/places/<id>)
  onOpenPlace?: (id: string | null) => void;
  onSavePlace: (p: Omit<Place, "id">, id?: string) => void;
  onDeletePlace: (id: string) => void;
  exportCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
}

// Straight-line distance in km (good enough for "which is closest")
const km = (from: { lat: number; lng: number }, p: { lat: number; lng: number }) => distanceKm(from, p);

const FILTER_BAR_FALLBACK = 128; // px the floating search and filters take at the top of the map on phones, until measured
const FAR_KM = 400;               // further than this from the state: the map can't show you, the list still sorts by distance

export function PlacesPage({ initial, queryKey, placeId = null, onOpenPlace, state, categories, places, admin, canDelete, onSaveCategory, onDeleteCategory, categoryUsage, loading, ready = true, onSavePlace, onDeletePlace, exportCount, onExport, onImport }: Props) {
  const phone = useMedia("(max-width: 760px)");
  const { picked, toggle: toggleCategory, clear: clearCategories, multi, setMulti } = useChipFilter(initial?.cat ? [initial.cat] : []); // single-select unless "Select several" is on
  const [district, setDistrict] = useState("all");
  const [q, setQ] = useState(initial?.q ?? "");
  const [visitedOnly, setVisitedOnly] = useState(!!initial?.visited);
  const [me, setMe] = useState<{ lat: number; lng: number; accuracy?: number; intent?: "map" | "fit" | "near"; at?: number } | null>(null); // the visitor's GPS position, once asked for
  const [sortNear, setSortNear] = useState(false); // "Near me": sort the list by distance from the position
  const [locating, setLocating] = useState(false);
  const [showAll, setShowAll] = useState(false); // the map starts with no pins: they appear when you choose something (or tap All)
  const mine = useVisited();
  const selectedId = placeId;
  const openedHere = useRef(false); // true once a place was opened from this list, so Back can simply go back
  const floatRef = useRef<HTMLDivElement>(null);
  const [filterH, setFilterH] = useState(FILTER_BAR_FALLBACK);
  const [focusTick, setFocusTick] = useState(0);
  // Arriving with a filter (a category tile, a search, "Near me", "My visited") opens the list so the results are visible at once.
  const [snap, setSnap] = useState<Snap>(() => (phone && (initial?.cat || initial?.q || initial?.visited || initial?.near) ? "half" : "peek"));
  const [sheetH, setSheetH] = useState(84);
  const [catDialog, setCatDialog] = useState(false);

  // The floating filter bar can wrap or grow with the font size: measure it instead of assuming a height.
  useEffect(() => {
    const el = floatRef.current;
    if (!el || !phone) return;
    const ro = new ResizeObserver(() => setFilterH(Math.round(el.getBoundingClientRect().height) || FILTER_BAR_FALLBACK));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone]);
  const [dialog, setDialog] = useState<{ editing: Place | null } | null>(null);
  // Opened from a tile, a search or a shortcut on another page: offer a way back to it.
  const [cameFromLink] = useState(() => !!(initial?.cat || initial?.q || initial?.visited || initial?.near) && canGoBack());

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    places.forEach(p => { m[p.category] = (m[p.category] ?? 0) + 1; });
    return m;
  }, [places]);
  const districts = useMemo(() => [...new Set(places.map(p => p.district).filter(Boolean) as string[])].sort(), [places]);
  const visibleCats = categories; // every category is offered, even one with no places yet (it shows an empty list)
  const visitedIds = useMemo(() => new Set(Object.keys(mine.visited)), [mine.visited]);

  // "Near me": ask the phone where it is, then sort by distance. Nothing is sent anywhere.
  const askLocation = (intent: "map" | "fit" | "near" = "near") => {
    if (!navigator.geolocation) return void notify("This device can't share its location.", "error");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMe({ ...here, accuracy: pos.coords.accuracy, intent, at: Date.now() });
      },
      err => {
        setLocating(false);
        void notify(err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow it for this site in your browser settings, then try again."
          : "Couldn't get your location. Move to an open area and try again.", "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };
  // "Near me" sorts by distance; the position itself is also used to show how far a place is.
  const toggleNear = () => { if (sortNear) setSortNear(false); else { setSortNear(true); if (!me) askLocation("near"); } };
  useEffect(() => { if (initial?.near) { setSortNear(true); askLocation("near"); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deferredQ = useDeferredValue(q); // typing stays instant; the list and pins catch up a moment later
  const filtered = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    return places
      .filter(p => (!picked.size || picked.has(p.category)) &&
        (district === "all" || p.district === district) &&
        (!visitedOnly || visitedIds.has(p.id)) &&
        (!needle || [p.name, p.desc, p.district, p.notes].join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => (sortNear && me ? km(me, a) - km(me, b) : a.name.localeCompare(b.name)));
  }, [places, picked, district, deferredQ, visitedOnly, visitedIds, me, sortNear]);

  const filtering = picked.size > 0 || district !== "all" || !!q.trim() || visitedOnly || sortNear;
  const pinsOn = showAll || filtering;
  const pickedCat = picked.size === 1 ? categories.find(c => c.id === [...picked][0]) : undefined;
  const selected = selectedId ? places.find(p => p.id === selectedId) ?? null : null;

  // On phones the list sits low over the map; searching or filtering brings it up so results are visible.
  useEffect(() => { if (phone && q && snap === "peek" && !selected) setSnap("half"); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  usePageMeta(
    selected ? `${selected.name}${selected.district ? `, ${selected.district}` : ""}: ${catById[selected.category]?.label ?? "place"} in ${state.name}`
      : `${pickedCat?.label ?? "Places"} in ${state.name}: map and directions`,
    selected ? `${selected.desc ?? `${selected.name} in ${selected.district ?? state.name}.`} Directions, coordinates and distance.`.slice(0, 158)
      : `Browse ${pickedCat ? pickedCat.label.toLowerCase() : "tourist sites, picnic spots, snack stalls, hotels and resorts"} in ${state.name} on a map, with district boundaries, search and directions.`);

  const closeDetails = () => { if (openedHere.current && canGoBack()) { openedHere.current = false; history.back(); } else onOpenPlace?.(null); };
  const open = (id: string) => {
    setFocusTick(n => n + 1);
    if (id !== selectedId) { openedHere.current = openedHere.current || !selectedId; onOpenPlace?.(id); }
    if (phone) setSnap(s => (s === "full" ? "half" : s === "peek" ? "half" : s));
  };
  // After adding a place, show it on the map as soon as it appears in the list.
  const justAdded = useRef<{ name: string; lat: number; lng: number } | null>(null);
  useEffect(() => {
    const a = justAdded.current;
    const p = a && places.find(x => x.name === a.name && Math.abs(x.lat - a.lat) < 1e-6 && Math.abs(x.lng - a.lng) < 1e-6);
    if (p) { justAdded.current = null; clearFilters(); open(p.id); }
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (p: Place) => {
    if (await confirmAsk(`Delete "${p.name}"?`, { yes: "Delete", danger: true })) { onDeletePlace(p.id); closeDetails(); }
  };

  const adminTools = admin && (
    <div className="pl-tools">
      <Button variant="primary" icon="plus" onClick={() => setDialog({ editing: null })}>Add place</Button>
      {onSaveCategory && <Button onClick={() => setCatDialog(true)}>Categories</Button>}
      <Button onClick={onExport} disabled={!exportCount}>Export ({exportCount})</Button>
      <label className="btn file">Import
        <input type="file" accept=".json,application/json" hidden
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
      </label>
    </div>
  );

  const clearFilters = () => { clearCategories(); setDistrict("all"); setQ(""); setVisitedOnly(false); };

  // A link to this page with other filters (a Home tile, a shortcut) re-applies them here, without rebuilding the map.
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) { firstQuery.current = false; return; }
    clearFilters();
    if (initial?.cat) toggleCategory(initial.cat);
    setQ(initial?.q ?? "");
    setVisitedOnly(!!initial?.visited);
    if (initial?.near) { setSortNear(true); askLocation("near"); } else setSortNear(false);
    if (phone && (initial?.cat || initial?.q || initial?.visited || initial?.near)) setSnap("half");
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = (
    <>
      {adminTools}
      <ul className="pl-list">
        {!ready && <li><Skeleton rows={5} label="Loading places" /></li>}
        {ready && filtered.length === 0 && (
          <li>
            {visitedOnly && !mine.count
              ? <EmptyState title="No visited places yet" hint="Tick a place and it will appear here." action={{ label: "Browse places", onClick: () => setVisitedOnly(false) }} />
              : pickedCat && !counts[pickedCat.id] && picked.size === 1 && !q.trim() && district === "all"
                ? <EmptyState title={`No ${pickedCat.label.toLowerCase()} yet`} hint={admin ? "Use Add place to add the first one." : "They will appear here once they are added."} action={{ label: "Show all places", onClick: clearFilters }} />
              : filtering
                ? <EmptyState title="No places match" hint="Try a different search or remove a filter." action={{ label: "Clear filters", onClick: clearFilters }} />
                : <EmptyState title="No places yet" />}
          </li>
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
      onEdit={() => setDialog({ editing: selected })} onDelete={() => remove(selected)}
      distanceKm={me ? km(me, selected) : undefined} onLocate={() => askLocation("fit")} locating={locating} />
  );

  const filterBar = (
    <FilterBar q={q} onQuery={setQ} categories={visibleCats} counts={counts} picked={picked} onToggleCategory={toggleCategory}
      onAllCategories={clearCategories} allOn={showAll && !filtering} onAll={() => { clearCategories(); setVisitedOnly(false); setDistrict("all"); setQ(""); setSortNear(false); setShowAll(v => !(v && !filtering)); }} multi={multi} onMulti={setMulti} districts={districts} district={district} onDistrict={setDistrict}
      visitedOnly={visitedOnly} onVisitedOnly={() => setVisitedOnly(v => !v)} visitedCount={mine.count}
      near={sortNear} onNear={toggleNear} />
  );

  const title = selected
    ? <><IconButton icon="back" label="Back to the list" onClick={closeDetails} /><h2 className="pl-title">{selected.name}</h2></>
    : <>{cameFromLink && <IconButton icon="back" label="Back" onClick={() => goBack("#/")} />}<strong className="pl-title">{ready ? `${filtered.length} place${filtered.length === 1 ? "" : "s"}${loading ? " · updating…" : ""}` : "Loading places…"}</strong></>;

  return (
    <div className="places" style={{ "--sheet-h": `${phone ? sheetH : 0}px` } as React.CSSProperties}>
      <h1 className="sr-only">Places to visit in {state.name}</h1>
      <div className="map-wrap">
        {!pinsOn && !selected && ready && (
          <div className="map-hint" role="status">
            <span>Choose a category or search to see places on the map.</span>
            <Button onClick={() => setShowAll(true)}>Show all places</Button>
          </div>
        )}
        <MapView state={state} places={pinsOn ? filtered : selected ? [selected] : []} categories={catById} selectedId={selected?.id ?? null} focusTick={focusTick}
          visitedIds={visitedIds} me={me} onLocate={() => askLocation("map")} locating={locating} insets={phone ? { top: filterH, bottom: sheetH } : { top: 0, bottom: 0 }} onSelect={open} />
      </div>

      {phone ? (
        <>
          <div className="pl-float" ref={floatRef}>{filterBar}</div>
          <Sheet snap={snap} onSnap={setSnap} head={title} topGap={filterH} onHeight={setSheetH} label="Places">
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

      {catDialog && onSaveCategory && onDeleteCategory && (
        <CategoryManager categories={categories} counts={counts} usageOf={categoryUsage} onSave={onSaveCategory} onDelete={onDeleteCategory} onClose={() => setCatDialog(false)} />
      )}
      {dialog && (
        <AddPlaceDialog center={state.center} zoom={state.zoom} categories={categories} districts={districts} editing={dialog.editing}
          onSave={(p, id) => { if (!id) justAdded.current = { name: p.name, lat: p.lat, lng: p.lng }; onSavePlace(p, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
