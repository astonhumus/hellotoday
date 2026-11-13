import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Category, Place, StateInfo } from "../../types";
import { confirmAsk, notify, toastAction } from "../../lib/ui";
import { useFavorites } from "../../lib/favorites";
import { useTrip, MAX_TRIP } from "../../lib/trip";
import { store } from "../../lib/data";
import { useVisited } from "../../lib/visited";
import { FooterLinks } from "../../components/AboutPage";
import { Button, IconButton } from "../../ui/Button";
import { Sheet, type Snap } from "../../ui/Sheet";
import { useMedia } from "../../ui/useMedia";
import { useChipFilter } from "../../ui/useChipFilter";
import { usePageMeta } from "../../lib/pageMeta";
import { distanceKm, pathKm, routeOrder } from "../../lib/geo";
import { plural } from "../../lib/format";
import { formatDistance } from "../../lib/prefs";
import { canSuggest, openSuggest } from "../../lib/suggest";
import { googleRouteUrl } from "../../lib/nav";
import { searchPlaces, SEARCH_MAX } from "../../lib/search";
import { canGoBack, goBack } from "../../lib/nav";
import { rememberRecent } from "../../ui/SearchField";
import { MapView, type Me } from "./MapView";
import { CategoryManager } from "./CategoryManager";
import { AddPlaceDialog } from "./AddPlaceDialog";
import { ClosureDialog } from "./ClosureDialog";
import { FilterBar } from "./FilterBar";
import { PlaceCard } from "./PlaceCard";
import { PlaceDetails } from "./PlaceDetails";
import { EmptyState, Skeleton } from "../../ui/States";
import { Menu } from "../../ui/Menu";
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
  allRegions?: boolean;                       // places from every region are listed and the map is not limited to one
  onAllRegions?: () => void;                  // set only when a database exists
  regionNames?: Record<string, string>;       // state id -> name, for the chosen country
  loading?: boolean;
  ready?: boolean; // this state's places have arrived (or failed); until then the list shows placeholders
  initial?: { cat: string | null; q: string; visited: boolean; near: boolean; fav?: boolean; trip?: boolean; district?: string | null }; // from the address, e.g. #/places?cat=picnic
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
const FAR_KM = 400;               // further than this from the region: the map stays on the region, the list still sorts by distance

export function PlacesPage({ initial, queryKey, placeId = null, onOpenPlace, state, categories, places, admin, canDelete, onSaveCategory, onDeleteCategory, categoryUsage, allRegions = false, onAllRegions, regionNames = {}, loading, ready = true, onSavePlace, onDeletePlace, exportCount, onExport, onImport }: Props) {
  const phone = useMedia("(max-width: 760px)");
  const { picked, toggle: toggleCategory, clear: clearCategories } = useChipFilter(initial?.cat ? [initial.cat] : []); // tap several categories to combine them
  const [district, setDistrict] = useState(initial?.district ?? "all");
  const [q, setQ] = useState(initial?.q ?? "");
  const [visitedOnly, setVisitedOnly] = useState(!!initial?.visited);
  const [favOnly, setFavOnly] = useState(!!initial?.fav);
  const [tripOnly, setTripOnly] = useState(!!initial?.trip);
  const [closedOnly, setClosedOnly] = useState(false); // admin / contributor: only closed and archived places, to review or reopen them
  const [me, setMe] = useState<Me | null>(null); // the visitor's GPS position, once asked for
  const [sortNear, setSortNear] = useState(false); // "Near me" / "Nearest first": sort the list by distance from the position
  const [locating, setLocating] = useState(false);
  const [showAll, setShowAll] = useState(true); // the map starts with every pin (clustered); choosing something narrows them
  const mine = useVisited();
  const favs = useFavorites("place");
  const trip = useTrip();
  const selectedId = placeId;
  const openedHere = useRef(false); // true once a place was opened from this list, so Back can simply go back
  const floatRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [filterH, setFilterH] = useState(FILTER_BAR_FALLBACK);
  const [focusTick, setFocusTick] = useState(0);
  // Arriving with a filter (a category tile, a search, "Near me", "My visited") opens the list so the results are visible at once.
  const [snap, setSnapState] = useState<Snap>(() => {
    if (phone && (initial?.cat || initial?.q || initial?.visited || initial?.near || initial?.fav || initial?.trip || initial?.district)) return "half";
    const saved = store.get("sheet-snap");
    return saved === "half" || saved === "full" ? saved : "peek"; // the list opens the way it was last left
  });
  const setSnap: typeof setSnapState = v => setSnapState(cur => { const n = typeof v === "function" ? v(cur) : v; store.set("sheet-snap", n); return n; });
  const [sheetH, setSheetH] = useState(84);
  const [catDialog, setCatDialog] = useState(false);
  const [closing, setClosing] = useState<Place | null>(null); // the place whose closure is being set

  // The floating filter bar can wrap or grow with the font size: measure it instead of assuming a height.
  useEffect(() => {
    const el = floatRef.current;
    if (!el || !phone) return;
    const ro = new ResizeObserver(() => setFilterH(Math.round(el.getBoundingClientRect().height) || FILTER_BAR_FALLBACK));
    ro.observe(el);
    return () => ro.disconnect();
  }, [phone]);

  // Messages and toasts rise above the list sheet instead of covering its title and button.
  useEffect(() => {
    if (!phone) return;
    document.documentElement.style.setProperty("--toast-lift", `${sheetH}px`);
    return () => { document.documentElement.style.removeProperty("--toast-lift"); };
  }, [phone, sheetH]);

  const [dialog, setDialog] = useState<{ editing: Place | null } | null>(null);
  // Opened from a tile, a search or a shortcut on another page: offer a way back to it.
  const [cameFromLink] = useState(() => !!(initial?.cat || initial?.q || initial?.visited || initial?.near || initial?.fav || initial?.trip) && canGoBack());

  // Name of a place's state/province: known for the chosen country; for others the id ("afg-badakhshan") is made readable.
  const regionLabel = (id?: string) => !id ? undefined : regionNames[id] ?? id.replace(/^[a-z]{3}-/, "").replace(/-/g, " ").replace(/[a-z]/,c=>c.toUpperCase()).replace(/ [a-z]/g, c => c.toUpperCase());
  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    places.forEach(p => { m[p.category] = (m[p.category] ?? 0) + 1; });
    return m;
  }, [places]);
  const districts = useMemo(() => [...new Set(places.map(p => p.district).filter(Boolean) as string[])].sort(), [places]);
  // Favourites, ticks and trip stops are kept for every region; the numbers shown are for the places in this list.
  const visitedHere = useMemo(() => places.filter(p => mine.has(p.id)).length, [places, mine.visited]); // eslint-disable-line react-hooks/exhaustive-deps
  const favHere = useMemo(() => places.filter(p => favs.set.has(p.id)).length, [places, favs.set]);
  const tripHere = useMemo(() => places.filter(p => trip.set.has(p.id)).length, [places, trip.set]);
  const visibleCats = categories; // every category is offered, even one with no places yet (it shows an empty list)
  const visitedIds = useMemo(() => new Set(Object.keys(mine.visited)), [mine.visited]);
  const closedIds = useMemo(() => new Set(places.filter(p => p.closure).map(p => p.id)), [places]);

  // "Near me": ask the phone where it is, then sort by distance. Nothing is sent anywhere.
  const askLocation = async (intent: NonNullable<Me["intent"]> = "near") => {
    const giveUp = () => { if (intent === "near") setSortNear(false); }; // the sort only stays on if a position arrives
    if (!navigator.geolocation) { giveUp(); return void notify("This device can't share its location.", "error"); }
    // Say why before the browser's own permission box appears (once).
    if (!me && store.get("geo-explained") !== "1") {
      if (!(await confirmAsk("To show distances, this app needs your phone's location. It is used only on this device and is never sent or saved anywhere.", { yes: "Continue" }))) { giveUp(); return; }
      store.set("geo-explained", "1");
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const away = km(here, { lat: state.center[0], lng: state.center[1] });
        const far = !allRegions && away > FAR_KM;
        setMe({ ...here, accuracy: pos.coords.accuracy, intent, at: Date.now(), far });
        if (far && intent === "near") void notify(`You're about ${formatDistance(away)} from ${state.name}, so the map stays here. Places are sorted by their distance from you.`);
      },
      err => {
        setLocating(false);
        giveUp();
        void notify(err.code === err.PERMISSION_DENIED ? "Location is blocked. Tap the lock icon next to the web address, allow Location, then try again."
          : "Couldn't get your location. Move to an open area and try again.", "error");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };
  // "Near me" sorts by distance; the position itself is also used to show how far a place is.
  const startNear = () => { setSortNear(true); if (!me) void askLocation("near"); };
  const toggleNear = () => { if (sortNear) setSortNear(false); else startNear(); };
  useEffect(() => { if (initial?.near) startNear(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pages, setPages] = useState(1); // "Show more" reveals another batch of search results
  useEffect(() => setPages(1), [q, picked, district, visitedOnly, favOnly, closedOnly, tripOnly]);
  const deferredQ = useDeferredValue(q); // typing stays instant; the list and pins catch up a moment later
  const start = me && !me.far ? me : null; // a trip's first leg begins where the visitor is, when that is anywhere near
  const { list: filtered, total: matchTotal } = useMemo(() => {
    const allowed = places.filter(p => (!picked.size || picked.has(p.category)) && (district === "all" || p.district === district) && (!visitedOnly || visitedIds.has(p.id)) && (!closedOnly || !!p.closure) && (!favOnly || favs.set.has(p.id)) && (!tripOnly || trip.set.has(p.id)));
    const found = searchPlaces(allowed, deferredQ, p => ({ name: p.name, category: catById[p.category]?.label, district: p.district, desc: p.desc, notes: p.notes }), SEARCH_MAX * pages);
    if (found) { // typed text: the most relevant few, unless the list is sorted by distance
      const list = found.hits.map(h => h.item);
      return { list: sortNear && me ? list.sort((a, b) => km(me, a) - km(me, b)) : list, total: found.total };
    }
    if (tripOnly) { // a day's plan: in the order the stops are best visited
      const added = [...allowed].sort((a, b) => trip.ids.indexOf(a.id) - trip.ids.indexOf(b.id));
      return { list: routeOrder(added, start), total: added.length };
    }
    const catOrder = (id: string) => categories.findIndex(c => c.id === id);
    const list = allowed.sort((a, b) => (sortNear && me ? km(me, a) - km(me, b)
      : favOnly ? catOrder(a.category) - catOrder(b.category) || a.name.localeCompare(b.name) // favourites are grouped by category
      : a.name.localeCompare(b.name)));
    return { list, total: list.length };
  }, [places, picked, district, deferredQ, visitedOnly, visitedIds, favOnly, closedOnly, tripOnly, trip.set, trip.ids, favs.set, me, start, sortNear, catById, categories, pages]);

  const filtering = picked.size > 0 || district !== "all" || !!q.trim() || visitedOnly || favOnly || closedOnly || tripOnly || sortNear;
  const pinsOn = showAll || filtering;
  // The number on each category chip is how many places choosing it would show, given the other filters (district, favourites, …),
  // so it matches the list and the numbers on the map.
  const chipCounts = useMemo(() => {
    const m: Record<string, number> = {};
    places.forEach(p => {
      if ((district === "all" || p.district === district) && (!visitedOnly || visitedIds.has(p.id)) && (!closedOnly || !!p.closure) && (!favOnly || favs.set.has(p.id)) && (!tripOnly || trip.set.has(p.id)))
        m[p.category] = (m[p.category] ?? 0) + 1;
    });
    return m;
  }, [places, district, visitedOnly, visitedIds, closedOnly, favOnly, favs.set, tripOnly, trip.set]);
  const pickedCat = picked.size === 1 ? categories.find(c => c.id === [...picked][0]) : undefined;
  const selected = selectedId ? places.find(p => p.id === selectedId) ?? null : null;
  const missing = !!selectedId && !selected && ready && !loading; // an address for a place that doesn't exist (any more)
  const stops = tripOnly && !q.trim() ? new Map(filtered.map((p, i) => [p.id, i + 1])) : null;
  const tripLine = useMemo(() => (tripOnly && !q.trim() ? [...(start ? [start] : []), ...filtered] : undefined), [tripOnly, q, start, filtered]);

  // On phones the list sits low over the map; searching or filtering brings it up so results are visible.
  useEffect(() => { if (phone && q && snap === "peek") setSnap("half"); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  usePageMeta(
    selected ? `${selected.name}${selected.district ? `, ${selected.district}` : ""}: ${catById[selected.category]?.label ?? "place"} in ${state.name}`
      : `${pickedCat?.label ?? "Places"} in ${state.name}: map and directions`,
    selected ? `${selected.desc ?? `${selected.name} in ${selected.district ?? state.name}.`} Directions, coordinates and distance.`.slice(0, 158)
      : `Browse ${pickedCat ? pickedCat.label.toLowerCase() : "tourist sites, picnic spots, snack stalls, hotels and resorts"} in ${state.name} on a map, with district boundaries, search and directions.`);

  // Opening a place from an address (a shared link, Back/Forward, a search-engine page) lifts the list so its details can be read.
  useEffect(() => { if (phone && selectedId && snap === "peek") setSnap("half"); }, [selectedId, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the list was scrolled to, so Back from a place lands on the same row instead of the top.
  const listScroll = useRef(0);
  const scroller = () => rootRef.current?.querySelector<HTMLElement>(phone ? ".sheet-body" : ".pl-side-body") ?? null;
  useLayoutEffect(() => { if (!selectedId) { const el = scroller(); if (el) el.scrollTop = listScroll.current; } }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeDetails = () => { if (openedHere.current && canGoBack()) { openedHere.current = false; history.back(); } else onOpenPlace?.(null); };
  const open = (id: string) => {
    setFocusTick(n => n + 1);
    if (!selectedId) listScroll.current = scroller()?.scrollTop ?? 0;
    if (q.trim()) rememberRecent("places", q); // a search that led to a place is worth remembering
    if (id !== selectedId) { openedHere.current = openedHere.current || !selectedId; onOpenPlace?.(id); }
    if (phone) setSnap(s => (s === "full" ? "half" : s === "peek" ? "half" : s));
  };

  // Searching or filtering while a place is open shows the results: the details give way to the list.
  const filterSig = [q, [...picked].sort().join(","), district, visitedOnly, favOnly, closedOnly, tripOnly, sortNear].join("|");
  const lastSig = useRef(filterSig);
  const quietUntil = useRef(0); // changes made by the app itself (a link, a place just added) must not close what it just opened
  useEffect(() => {
    if (filterSig === lastSig.current) return;
    lastSig.current = filterSig;
    if (Date.now() < quietUntil.current) return;
    if (selectedId) { listScroll.current = 0; onOpenPlace?.(null); }
  }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // After adding a place, show it on the map as soon as it appears in the list.
  const justAdded = useRef<{ name: string; lat: number; lng: number } | null>(null);
  useEffect(() => {
    const a = justAdded.current;
    const p = a && places.find(x => x.name === a.name && Math.abs(x.lat - a.lat) < 1e-6 && Math.abs(x.lng - a.lng) < 1e-6);
    if (p) { justAdded.current = null; quietUntil.current = Date.now() + 800; clearFilters(); open(p.id); }
  }, [places]); // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async (p: Place) => {
    if (await confirmAsk(`Delete "${p.name}"?`, { yes: "Delete", danger: true })) { onDeletePlace(p.id); closeDetails(); }
  };

  // One main action; the rest (categories, export, import) sit behind "⋯" so the row never wraps.
  const importInput = useRef<HTMLInputElement>(null);
  const adminTools = admin && (
    <div className="pl-tools">
      <Button variant="primary" icon="plus" onClick={() => setDialog({ editing: null })}>Add place</Button>
      <Menu label="More admin tools" items={[
        ...(onSaveCategory ? [{ label: "Manage categories", icon: "edit" as const, onClick: () => setCatDialog(true) }] : []),
        ...(exportCount ? [{ label: `Export places (${exportCount})`, icon: "download" as const, onClick: onExport }] : []),
        { label: "Import places", icon: "up", onClick: () => importInput.current?.click() }
      ]} />
      <input ref={importInput} type="file" accept=".json,application/json" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
    </div>
  );

  const clearFilters = () => { clearCategories(); setDistrict("all"); setQ(""); setVisitedOnly(false); setFavOnly(false); setClosedOnly(false); setTripOnly(false); setSortNear(false); };
  // Adding needs no message: the heart or tick fills in. Taking one away offers Undo, in case it was a slip.
  const toggleVisited = (p: Place) => {
    const was = mine.has(p.id);
    mine.toggle(p.id);
    if (was) toastAction(`Removed "${p.name}" from visited`, "Undo", () => mine.toggle(p.id));
  };
  const toggleFav = (p: Place) => {
    const was = favs.has(p.id);
    favs.toggle(p.id);
    if (was) toastAction(`Removed "${p.name}" from favourites`, "Undo", () => favs.toggle(p.id));
  };
  const toggleTripStop = (p: Place) => {
    if (!trip.has(p.id) && trip.count >= MAX_TRIP) return void notify(`A trip can have up to ${MAX_TRIP} stops. Remove one first.`, "error");
    const was = trip.has(p.id);
    trip.toggle(p.id);
    if (was) toastAction(`Removed "${p.name}" from your trip`, "Undo", () => trip.toggle(p.id));
  };

  // A link to this page with other filters (a Home tile, a shortcut) re-applies them here, without rebuilding the map.
  const firstQuery = useRef(true);
  useEffect(() => {
    if (firstQuery.current) { firstQuery.current = false; return; }
    quietUntil.current = Date.now() + 800;
    clearFilters();
    if (initial?.cat) toggleCategory(initial.cat);
    setQ(initial?.q ?? "");
    setVisitedOnly(!!initial?.visited);
    setFavOnly(!!initial?.fav);
    setTripOnly(!!initial?.trip);
    if (initial?.district) setDistrict(initial.district);
    if (initial?.near) startNear(); else setSortNear(false);
    if (phone && (initial?.cat || initial?.q || initial?.visited || initial?.near || initial?.fav || initial?.trip)) setSnap("half");
  }, [queryKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareUrl = (p: Place) =>
    `${location.origin}${location.pathname}#/places/${encodeURIComponent(p.id)}?region=${encodeURIComponent(p.regionId ?? state.id)}&country=${encodeURIComponent(state.country ?? "IND")}`;

  const tripKm = tripOnly ? pathKm([...(start ? [start] : []), ...filtered]) : 0;
  const tripPanel = tripOnly && filtered.length > 0 && !q.trim() && (
    <div className="trip-panel">
      <p><strong>{plural(filtered.length, "stop")}</strong> · about {formatDistance(tripKm)} in a straight line{start ? ", starting from you" : ""}</p>
      <div className="trip-actions">
        <a className="btn primary" href={googleRouteUrl(filtered)} target="_blank" rel="noopener"><span className="sr-only">Open the route in </span>Open route in Google Maps</a>
        {!start && <Button icon="locate" disabled={locating} onClick={() => void askLocation("quiet")}>{locating ? "Locating…" : "Start from my location"}</Button>}
        <Button icon="trash" onClick={async () => { if (await confirmAsk(`Remove all ${plural(trip.count, "stop")} from your trip?`, { yes: "Clear trip", danger: true })) { trip.clear(); setTripOnly(false); } }}>Clear trip</Button>
      </div>
      <p className="hint">The order is a quick estimate: always the nearest stop next. Distances are straight lines; the route in Google Maps follows real roads.</p>
    </div>
  );

  const list = (
    <>
      {adminTools}
      {visitedOnly && visitedHere > 0 && (
        <div className="visit-progress" role="status">
          <span><strong>{visitedHere} of {places.length}</strong> places visited in {state.name}</span>
          <div className="ckp-bar" role="progressbar" aria-label="Visited" aria-valuemin={0} aria-valuemax={places.length} aria-valuenow={visitedHere}><div style={{ width: `${places.length ? Math.round(visitedHere / places.length * 100) : 0}%` }} /></div>
        </div>
      )}
      {tripPanel}
      {ready && filtered.length > 1 && !tripOnly && (
        <div className="pl-sort">
          <label>Sort
            <select className="pill-select" value={sortNear ? "near" : "name"} aria-label="Sort the list" onChange={e => { if (e.target.value === "near") startNear(); else setSortNear(false); }}>
              <option value="name">A to Z</option>
              <option value="near">{locating ? "Finding you…" : "Nearest first"}</option>
            </select>
          </label>
        </div>
      )}
      <ul className="pl-list">
        {!ready && <li><Skeleton rows={5} label="Loading places" /></li>}
        {ready && filtered.length === 0 && (
          <li>
            {closedOnly
              ? <EmptyState title="No closed or archived places" hint="Places marked as closed or archived show up here." action={{ label: "Show all places", onClick: () => setClosedOnly(false) }} />
              : tripOnly && !tripHere
              ? <EmptyState title="Your trip is empty" hint="Open a place and tap “Add to trip”. Then come back here to see the stops in a sensible order." action={{ label: "Browse places", onClick: () => setTripOnly(false) }} />
              : favOnly && !favHere
              ? <EmptyState title="No favourites yet" hint="Tap the heart on a place to keep it here. Favourites are saved on this device only." action={{ label: "Browse places", onClick: () => setFavOnly(false) }} />
              : visitedOnly && !visitedHere
              ? <EmptyState title="No visited places yet" hint="Tick a place and it will appear here." action={{ label: "Browse places", onClick: () => setVisitedOnly(false) }} />
              : pickedCat && !counts[pickedCat.id] && picked.size === 1 && !q.trim() && district === "all"
                ? <EmptyState title={`No ${pickedCat.label.toLowerCase()} yet`} hint={admin ? "Use Add place to add the first one." : "They will appear here once they are added."} action={{ label: "Show all places", onClick: clearFilters }} />
              : filtering
                ? <EmptyState title="No places match" hint="Try a different search or remove a filter." action={{ label: "Clear filters", onClick: clearFilters }} />
                : <EmptyState title={`No places in ${state.name} yet`}
                    hint={admin ? "Use Add place to add the first one." : canSuggest ? "Know somewhere worth visiting? Tell us and it can be added." : "Places will appear here once they are added."}
                    action={!admin && canSuggest ? { label: "Suggest a place", onClick: () => openSuggest({ kind: "place" }) } : undefined} />}
          </li>
        )}
        {filtered.map(p => (
          <PlaceCard key={p.id} place={p} category={catById[p.category]} active={p.id === selectedId} stop={stops?.get(p.id)}
            visited={mine.has(p.id)} favorite={favs.has(p.id)} distanceKm={me ? km(me, p) : undefined} region={allRegions ? regionLabel(p.regionId) : undefined} onOpen={() => open(p.id)} onToggleVisited={() => toggleVisited(p)} onToggleFavorite={() => toggleFav(p)} />
        ))}
      </ul>
      {matchTotal > filtered.length && (
        <div className="pl-more"><Button onClick={() => setPages(n => n + 1)}>Show more results ({matchTotal - filtered.length} left)</Button></div>
      )}
      <FooterLinks />
    </>
  );

  const details = selected ? (
    <PlaceDetails place={selected} category={catById[selected.category]} visited={mine.has(selected.id)} visitedOn={mine.when(selected.id)}
      shareUrl={shareUrl(selected)} favorite={favs.has(selected.id)} onToggleFavorite={() => toggleFav(selected)}
      inTrip={trip.has(selected.id)} onToggleTrip={() => toggleTripStop(selected)}
      onToggleVisited={() => toggleVisited(selected)} admin={admin} canDelete={canDelete}
      onEdit={() => setDialog({ editing: selected })} onDelete={() => remove(selected)} onClosure={() => setClosing(selected)}
      distanceKm={me ? km(me, selected) : undefined} onLocate={() => askLocation("fit")} locating={locating} />
  ) : missing ? (
    <EmptyState title="We couldn't find that place" hint="It may have been removed, or the link is incomplete." action={{ label: "See all places", onClick: () => onOpenPlace?.(null) }} />
  ) : null;

  const filterBar = (
    <FilterBar q={q} onQuery={setQ} categories={visibleCats} counts={chipCounts} picked={picked} onToggleCategory={toggleCategory}
      onAllCategories={clearCategories} allOn={showAll && !filtering} onAll={() => { clearFilters(); setShowAll(true); }} districts={districts} district={district} onDistrict={setDistrict}
      visitedOnly={visitedOnly} onVisitedOnly={() => setVisitedOnly(v => !v)} visitedCount={visitedHere}
      tripOnly={tripOnly} onTripOnly={() => setTripOnly(v => !v)} tripCount={tripHere}
      onSearchFocus={phone ? () => setSnap("full") : undefined}
      closedOnly={closedOnly} onClosedOnly={admin ? () => setClosedOnly(v => !v) : undefined} closedCount={closedIds.size}
      favOnly={favOnly} onFavOnly={() => setFavOnly(v => !v)} favCount={favHere} filtering={filtering} onReset={clearFilters}
      compact={!phone && !!selected} near={sortNear} onNear={toggleNear} allRegions={allRegions} onAllRegions={onAllRegions} />
  );

  const n = filtered.length;
  const noun = (count: number) =>
    pickedCat ? `${plural(count, "place")} in ${pickedCat.label}`
    : picked.size > 1 ? `${plural(count, "place")} in ${picked.size} categories`
    : tripOnly ? `${plural(count, "stop")} in your trip`
    : visitedOnly ? `${plural(count, "visited place")}`
    : closedOnly ? `${plural(count, "closed or archived place")}`
    : favOnly ? plural(count, "favourite")
    : plural(count, "place");
  const titleText = !ready ? "Loading places…"
    : !filtering && !showAll ? "Choose a category or search to see places on the map"
    : matchTotal > n ? `Showing ${n} of ${noun(matchTotal)}`
    : `${noun(n)}${loading ? " · updating…" : ""}`;
  const title = selected || missing
    ? <><IconButton icon="back" label="Back to the list" onClick={closeDetails} /><h2 className="pl-title">{selected?.name ?? "Place not found"}</h2></>
    : <>{cameFromLink && <IconButton icon="back" label="Back" onClick={() => goBack("#/")} />}<strong className={"pl-title" + (!filtering && !showAll ? " hint" : "")}>{titleText}</strong></>;

  return (
    <div className="places" ref={rootRef} style={{ "--sheet-h": `${phone ? sheetH : 0}px`, "--filter-bar-h": `${phone ? filterH : 0}px` } as React.CSSProperties}>
      <h1 className="sr-only">Places to visit in {state.name}</h1>
      <div className="map-wrap">
        <MapView state={state} places={pinsOn ? filtered : selected ? [selected] : []} categories={catById} selectedId={selected?.id ?? null} focusTick={focusTick}
          visitedIds={visitedIds} closedIds={closedIds} me={me} route={tripLine} onLocate={() => askLocation("map")} locating={locating} free={allRegions} insets={phone ? { top: filterH, bottom: sheetH } : { top: 0, bottom: 0 }} onSelect={open} />
      </div>

      {phone ? (
        <>
          <div className="pl-float" ref={floatRef}>{filterBar}</div>
          <Sheet snap={snap} onSnap={setSnap} head={title} topGap={filterH} onHeight={setSheetH} label="Places" openLabel={selected ? "Details" : "List"}>
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
      {closing && (
        <ClosureDialog place={closing} onClose={() => setClosing(null)} onSave={(closure, note) => {
          const { id, ...rest } = closing;
          const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
          onSavePlace({ ...rest, closure, closureNote: closure && note ? note : undefined, closedOn: closure ? (closing.closure === closure ? closing.closedOn ?? today : today) : undefined }, id);
          setClosing(null);
        }} />
      )}
      {dialog && (
        <AddPlaceDialog center={state.center} zoom={state.zoom} categories={categories} districts={districts} editing={dialog.editing}
          onSave={(p, id) => { if (!id) justAdded.current = { name: p.name, lat: p.lat, lng: p.lng }; onSavePlace(p, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
