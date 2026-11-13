import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Category, Place, StateInfo } from "../../types";
import { loadJson, store } from "../../lib/data";
import { Icon } from "../../ui/Icon";
import { iconSvg } from "../../ui/icons";
import { distanceKm } from "../../lib/geo";
import { formatDistance } from "../../lib/prefs";
import { notify } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

// Street map: roads, localities and landmarks from OpenStreetMap. Viewed tiles are cached for offline use (see vite.config.ts).
// Set VITE_TILE_URL to use another provider (e.g. MapTiler) if traffic grows; OpenStreetMap's free servers are for modest use.
const TILES = import.meta.env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const MAX_OFFLINE_TILES = 150;
const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const LABEL_MIN_ZOOM = 10; // district names appear from this zoom, so they don't pile up over Imphal
type MapStyle = "detailed" | "simple";

/** The visitor's GPS position. `intent` says why it was asked for; `far` means they are nowhere near the region shown. */
export interface Me { lat: number; lng: number; accuracy?: number; intent?: "map" | "fit" | "near" | "quiet"; at?: number; far?: boolean }

interface Props {
  state: StateInfo;
  places: Place[];
  categories: Record<string, Category>;
  selectedId: string | null;
  visitedIds: Set<string>;
  closedIds?: Set<string>; // closed places: drawn faded
  me?: Me | null; // the visitor's own GPS position
  route?: { lat: number; lng: number }[]; // "My trip": a line through the stops, in visiting order
  insets: { top: number; bottom: number }; // screen covered by the search bar and the bottom sheet (phones)
  free?: boolean;      // not limited to one region: places from several regions are shown, so the map may go anywhere
  focusTick?: number; // changes when the same place is tapped again, so the map re-centres on it
  onSelect: (id: string) => void;
  onLocate?: () => void;   // the "my location" button
  locating?: boolean;
}

// Leaflet's canvas layer can try to redraw after its map was removed (quick page changes), which throws.
// Skip the redraw in that case.
const canvasProto = L.Canvas.prototype as unknown as { _redraw: () => void; _clear: () => void; _ctx?: unknown; _redrawRequest?: unknown };
if (!(canvasProto as { _guarded?: boolean })._guarded) {
  const redraw = canvasProto._redraw, clear = canvasProto._clear;
  canvasProto._redraw = function (this: typeof canvasProto) { if (!this._ctx) { this._redrawRequest = undefined; return; } redraw.call(this); };
  canvasProto._clear = function (this: typeof canvasProto) { if (!this._ctx) return; clear.call(this); };
  (canvasProto as { _guarded?: boolean })._guarded = true;
}

// The same goes for a zoom animation that finishes after its map was removed.
// And for a pan animation (seen on tablets: a pan started while the map was being rebuilt ends after the old map is gone).
const mapProto = L.Map.prototype as unknown as { _onZoomTransitionEnd: () => void; _onPanTransitionEnd: () => void; _mapPane?: unknown; _zoomGuarded?: boolean };
if (!mapProto._zoomGuarded) {
  const done = mapProto._onZoomTransitionEnd, panDone = mapProto._onPanTransitionEnd;
  mapProto._onZoomTransitionEnd = function (this: typeof mapProto) { if (!this._mapPane) return; done.call(this); };
  mapProto._onPanTransitionEnd = function (this: typeof mapProto) { if (!this._mapPane) return; panDone.call(this); };
  mapProto._zoomGuarded = true;
}

// Leaflet draws to canvas/SVG and can't read CSS variables, so the theme tokens are read once here.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fallbackCategory = (): Category => ({ id: "", label: "Place", color: "", icon: "pin" });

// A place is a neutral round pin with its category glyph; the selected one fills with the accent, visited ones get an accent ring.
type PinState = "plain" | "visited" | "selected" | "closed";
const safeColor = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : ""); // goes into markup: only a plain hex colour
// The circle you see is 26px (38px selected); the tappable area around it is 10px wider, so a finger finds it more easily.
const PIN_PAD = 10;
const pinIcon = (glyph: string, state: PinState, color?: string) => {
  const size = 26 + PIN_PAD, col = safeColor(color);
  // The selected place is drawn by its own marker above everything (see selectedIcon); its pin in the cluster layer stays as an empty spot.
  if (state === "selected") return L.divIcon({ className: "pin-wrap pin-ghost", html: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  return L.divIcon({ className: "pin-wrap", html: `<span class="pin ${state}"${col ? ` style="--cat:${col}"` : ""}>${iconSvg(glyph, 14)}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

/**
 * The open place, like a dropped pin in Google Maps: a large teardrop in the category's colour with its glyph, its tip exactly on the spot,
 * a soft pulse around the tip and the place's name beside it. It drops in when a place is chosen.
 */
const SEL_W = 48, SEL_H = 64, SEL_TIP = 58; // the tip sits 58px down the 64px box; the rest is room for the pulse below it
const selectedIcon = (glyph: string, color: string | undefined, name: string, closed: boolean) => {
  const col = safeColor(color);
  const glyphEl = el("span", { className: "sel-glyph" });
  glyphEl.innerHTML = iconSvg(glyph, 20); // the app's own icon markup
  const root = el("div", { className: "sel-pin" + (closed ? " closed" : "") },
    el("span", { className: "sel-shadow" }), el("span", { className: "sel-pulse" }),
    el("span", { className: "sel-body" }, el("span", { className: "sel-head" }, glyphEl), el("span", { className: "sel-label" }, name)));
  if (col) root.style.setProperty("--cat", col);
  return L.divIcon({ className: "sel-wrap", html: root, iconSize: [SEL_W, SEL_H], iconAnchor: [SEL_W / 2, SEL_TIP] });
};

/** A group of pins: the number of places in it, ringed in their categories' colours (one colour when they are all of one category). */
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const clusterIcon = (byCat: Map<string, number>, total: number, cats: Record<string, Category>) => {
  const parts = [...byCat].sort((a, b) => b[1] - a[1]);
  const colorOf = (id: string) => safeColor(cats[id]?.color) || "var(--text-2)";
  let at = 0;
  const ring = parts.map(([id, n]) => { const from = at; at += (n / total) * 100; return `${colorOf(id)} ${from.toFixed(2)}% ${at.toFixed(2)}%`; }).join(", ");
  const one = parts.length === 1 ? parts[0][0] : null;
  const size = total < 10 ? 36 : total < 100 ? 42 : 48;
  const what = one ? `${total} ${cats[one]?.label ?? "places"}` : `${total} places in ${parts.length} categories`;
  const style = `--ring: conic-gradient(${ring});${one ? ` --cat: ${colorOf(one)};` : ""} width:${size}px; height:${size}px`;
  return L.divIcon({
    className: "cluster-wrap", iconSize: [size, size],
    html: `<span class="cluster${one ? " one" : ""}" style="${style}" title="${esc(what)}. Tap to zoom in"><b>${total}</b></span>`
  });
};

export function MapView({ state, places, categories, selectedId, free = false, focusTick, visitedIds, closedIds, me, route, insets, onSelect, onLocate, locating }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.Marker>());
  const pinState = useRef(new Map<string, { glyph: string; color: string; state: PinState }>());
  const pinLayer = useRef<L.MarkerClusterGroup | null>(null);
  const catOf = useRef(new WeakMap<L.Marker, string>()); // each pin's category, so a group of pins can show what it holds
  const catsRef = useRef(categories);
  catsRef.current = categories;
  const theme = useTheme(); // the map reads its colours when it is built, so a theme change rebuilds it
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const freeRef = useRef(free);
  freeRef.current = free;
  const tileLayer = useRef<L.TileLayer | null>(null);
  const [style, setStyle] = useState<MapStyle>(() => (store.get("map-style") === "simple" ? "simple" : "detailed"));
  const [showDistricts, setShowDistricts] = useState(() => store.get("map-districts") !== "off");
  const [districtData, setDistrictData] = useState<any>(null);
  const districtLayer = useRef<L.GeoJSON | null>(null);
  const stateStroke = useRef<L.GeoJSON | null>(null);
  const haveDistrictOutline = useRef(false);
  const stateBounds = useRef<L.LatLngBounds | null>(null);
  const lastFit = useRef("");            // which set of places the map was last fitted to, so a data refresh doesn't move the map
  // Without animation: an animated zoom that ends later would make Leaflet pull the view back inside its limits, cancelling a flight to a place.
  const fitMinZoom = (map: L.Map) => {
    if (!stateBounds.current) return;
    const min = Math.max(0, map.getBoundsZoom(stateBounds.current) - 1);
    if (map.getZoom() < min) map.setZoom(min, { animate: false });
    map.setMinZoom(min);
  };
  const [menu, setMenu] = useState(false); // the layers menu
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu closes when you tap the map or press Escape.
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const [ready, setReady] = useState(0); // bumps when the map is rebuilt, so the tiles are re-added

  // Border maps below the street tiles: they show through wherever a tile can't be loaded (offline, not cached yet).
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { preferCanvas: true, zoomSnap: 0.5, worldCopyJump: false, maxZoom: 18 }) // maxZoom is needed up front by the pin clusters
      .setView(state.center, state.zoom);
    map.createPane("borders").style.zIndex = "150";   // under the tile pane (200)
    map.createPane("outline").style.zIndex = "250";   // over the tiles
    map.createPane("selected").style.zIndex = "640";  // the open place's pin: over every other pin and group (markers are 600)
    mapRef.current = map;
    const host0 = host.current;
    const mark = () => { host0.dataset.zoom = String(map.getZoom()); }; // the current zoom, readable from outside (tests, debugging)
    map.on("zoomend", mark); mark();
    prevView.current = null; zoomedRef.current = false; setZoomedToMe(false);
    setReady(n => n + 1);
    // Pins that overlap merge into a numbered circle (tap to zoom in), so a crowded town stays readable and fast.
    // The number counts only the places shown (the chosen categories and filters), and the circle wears their categories' colours.
    pinLayer.current = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 44, disableClusteringAtZoom: 16, // no chunkedLoading: removing pins while a chunked load is under way crashes the cluster layer
      iconCreateFunction: c => {
        const byCat = new Map<string, number>();
        c.getAllChildMarkers().forEach(m => { const id = catOf.current.get(m) ?? ""; byCat.set(id, (byCat.get(id) ?? 0) + 1); });
        return clusterIcon(byCat, c.getChildCount(), catsRef.current);
      }
    }).addTo(map);
    let cancelled = false;

    // Drawing the borders is the heavy part: do it when the browser is idle, after the pins and tiles are up.
    const idle = (fn: () => void) => ("requestIdleCallback" in window ? (window as any).requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 50));
    // The borders of every state/province of the chosen country come from public/data/regions/<country>.json.
    Promise.all([loadJson<any>("world.json"), loadJson<any>(`regions/${state.country ?? "IND"}.json`)]).then(([world, regions]) => new Promise<void>(res => idle(() => { if (!cancelled) draw(world, regions); res(); }))).catch(() => {});
    // The region's main landmass is known up front, so the view can be fitted and limited straight away.
    if (state.bbox) {
      const [s, w, n, e] = state.bbox;
      const bounds = L.latLngBounds([s, w], [n, e]);
      stateBounds.current = bounds;
      try { map.fitBounds(bounds, { padding: [20, 20], animate: false }); } catch { /* container not measurable yet; the resize observer refits */ }
      fitMinZoom(map);
      if (!freeRef.current) map.setMaxBounds(bounds.pad(0.6));
    }
    const draw = (world: any, india: any) => {
      L.geoJSON(world, { pane: "borders", interactive: false, style: { color: token("--border-strong"), weight: 0.8, fillColor: token("--surface-2"), fillOpacity: 1 } }).addTo(map);
      L.geoJSON(india, { pane: "borders", interactive: false, style: { color: token("--border-strong"), weight: 0.8, fillColor: token("--surface"), fillOpacity: 1 } }).addTo(map);
      const mine = india.features.filter((f: any) => f.properties.id === state.id);
      const fc = { type: "FeatureCollection", features: mine } as any;
      L.geoJSON(fc, { pane: "borders", interactive: false, style: { color: token("--accent"), weight: 2, fillColor: token("--accent-wash"), fillOpacity: 1 } }).addTo(map);
      // Green state boundary stays visible on top of the street map.
      const outline = L.geoJSON(fc, { pane: "outline", interactive: false, style: { color: token("--accent"), weight: 2.5, fill: false } });
      if (!haveDistrictOutline.current) { outline.addTo(map); stateStroke.current = outline; }
      if (mine.length && !state.bbox) {
        const bounds = outline.getBounds();
        stateBounds.current = bounds;
        try { map.fitBounds(bounds, { padding: [20, 20], animate: false }); } catch { /* container not measurable yet; the resize observer refits */ }
        fitMinZoom(map);
        if (!freeRef.current) map.setMaxBounds(bounds.pad(0.6));
      }
    };

    // The map may be hidden (mobile List view) and shown later, or resized by rotating the phone.
    const ro = new ResizeObserver(() => { map.invalidateSize(); fitMinZoom(map); }); // rotating the phone changes how far out the map may zoom
    ro.observe(host.current);

    return () => { cancelled = true; ro.disconnect(); map.stop(); map.remove(); mapRef.current = null; pins.current.clear(); pinState.current.clear(); stateBounds.current = null; lastFit.current = ""; };
  }, [state, theme]);

  // "All regions": lift the limits that keep the map on the chosen region, and put them back when it is turned off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (free) { map.setMaxBounds(null as unknown as L.LatLngBounds); map.setMinZoom(2); return; }
    const b = stateBounds.current;
    if (b) { map.setMaxBounds(b.pad(0.6)); fitMinZoom(map); if (!selectedRef.current) map.fitBounds(b, { padding: [20, 20] }); } // an open place keeps the map on it
  }, [free, ready]);

  // District boundaries (public/data/<state>/districts.json), drawn over the tiles with the district name in the middle.
  useEffect(() => {
    setDistrictData(null);
    loadJson<any>(`${state.id}/districts.json`).then(setDistrictData).catch(() => {});
  }, [state.id]);

  // The green state line is merged from the district shapes (scripts/build-outline.mjs), so it matches the dashed lines exactly.
  useEffect(() => {
    haveDistrictOutline.current = !!districtData?.outline;
    const map = mapRef.current;
    if (!map || !districtData?.outline) return;
    stateStroke.current?.remove();
    const line = L.geoJSON(districtData.outline, { pane: "outline", interactive: false, style: { color: token("--accent"), weight: 2.5, fill: false } }).addTo(map);
    stateStroke.current = line;
    return () => { line.remove(); };
  }, [districtData, ready]);

  useEffect(() => {
    const map = mapRef.current;
    districtLayer.current?.remove();
    districtLayer.current = null;
    if (!map || !showDistricts || !districtData) return;
    const layer = L.geoJSON(districtData, {
      pane: "outline", interactive: false,
      style: { color: token("--text-2"), weight: 1.3, opacity: 0.85, dashArray: "6 4", fill: false },
      onEachFeature: (f, l) => (l as L.Polygon).bindTooltip(el("span", {}, String(f.properties.name)), { permanent: true, direction: "center", className: "district-label" })
    }).addTo(map);
    districtLayer.current = layer;
    const hideLabels = () => map.getContainer().classList.toggle("hide-district-labels", map.getZoom() < LABEL_MIN_ZOOM);
    hideLabels();
    map.on("zoomend", hideLabels);
    // Required credit for the open boundary data (ODbL).
    const credit = 'Districts: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a>';
    map.attributionControl.addAttribution(credit);
    return () => { map.off("zoomend", hideLabels); map.attributionControl.removeAttribution(credit); };
  }, [showDistricts, districtData, ready]);

  // Street tiles on top of the borders, switchable
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileLayer.current?.remove();
    tileLayer.current = null;
    if (style === "detailed") {
      tileLayer.current = L.tileLayer(TILES, {
        maxZoom: 18, crossOrigin: true, // CORS lets the service worker cache the tiles properly
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);
    }
  }, [style, ready]);

  // Pins
  useEffect(() => {
    const map = mapRef.current, group = pinLayer.current;
    if (!map || !group) return;
    // The cluster plugin leaves stale entries behind when pins are removed, moved or added one by one while others stay
    // (a later add then crashes the whole map). So whenever the set of pins changes, its layer is emptied and refilled in one
    // bulk step; the marker objects themselves are reused. A refresh that changes nothing touches nothing.
    const unique = [...new Map(places.map(p => [p.id, p])).values()]; // one pin per id, whatever the list holds
    const changed = unique.length !== pins.current.size || unique.some(p => {
      const have = pins.current.get(p.id);
      return !have || have.getLatLng().lat !== p.lat || have.getLatLng().lng !== p.lng;
    });
    if (changed) {
      group.clearLayers(); // pins are detached now, so they can be changed freely
      const keep = new Set(unique.map(p => p.id));
      pins.current.forEach((_m, id) => { if (!keep.has(id)) { pins.current.delete(id); pinState.current.delete(id); } });
    }
    unique.forEach(p => {
      const cat = categories[p.category] ?? fallbackCategory();
      const glyph = cat.icon, color = cat.color;
      const have = pins.current.get(p.id), meta = pinState.current.get(p.id);
      if (have) catOf.current.set(have, p.category);
      if (have) {
        if (have.getLatLng().lat !== p.lat || have.getLatLng().lng !== p.lng) have.setLatLng([p.lat, p.lng]);
        if (meta && (meta.glyph !== glyph || meta.color !== color)) { have.setIcon(pinIcon(glyph, meta.state, color)); meta.glyph = glyph; meta.color = color; }
        return;
      }
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(glyph, "plain", color), keyboard: false });
      m.on("click", () => onSelectRef.current(p.id));
      catOf.current.set(m, p.category);
      pins.current.set(p.id, m);
      pinState.current.set(p.id, { glyph, color, state: "plain" });
    });
    if (changed) group.addLayers(unique.map(p => pins.current.get(p.id)!));
    else group.refreshClusters(); // same pins, but a category may have changed colour or a place its category
    paint();
    // Re-zoom only when the set of places really changed (a filter, a search), after typing pauses, and never while a place is selected.
    const signature = places.map(p => p.id).sort().join("|");
    if (signature === lastFit.current) return;
    if (selectedRef.current && pins.current.has(selectedRef.current)) return;
    const t = setTimeout(() => {
      lastFit.current = signature;
      if (places.length && map.getSize().x > 0) {
        const { top, bottom } = insetsRef.current;
        try { map.fitBounds(group.getBounds(), { paddingTopLeft: [40, top + 16], paddingBottomRight: [40, bottom + 16], maxZoom: 11 }); } catch { /* ignore */ }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [places, categories, state]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pin looks: the selected one is big and filled; places you have visited get an accent ring.
  const paint = () => {
    pins.current.forEach((m, id) => {
      const meta = pinState.current.get(id);
      if (!meta) return;
      const state: PinState = id === selectedRef.current ? "selected" : closedIds?.has(id) ? "closed" : visitedIds.has(id) ? "visited" : "plain";
      if (meta.state !== state) { m.setIcon(pinIcon(meta.glyph, state, meta.color)); meta.state = state; }
      m.setZIndexOffset(state === "selected" ? 1000 : 0);
    });
  };
  useEffect(paint, [selectedId, visitedIds, closedIds, places]); // eslint-disable-line react-hooks/exhaustive-deps

  // "You are here": a blue dot, like Google Maps. The map can always show you,
  // even when you are far outside the region: its limits are widened to take you in.
  const meMarker = useRef<L.CircleMarker | null>(null);
  const prevView = useRef<{ center: L.LatLng; zoom: number } | null>(null); // where the map was before the GPS button zoomed in
  const zoomedRef = useRef(false);
  const [zoomedToMe, setZoomedToMe] = useState(false);
  const zoomIn = (map: L.Map, at: L.LatLngTuple, zoom: number) => {
    const { top, bottom } = insetsRef.current;
    map.flyTo(map.unproject(map.project(at, zoom).add([0, (bottom - top) / 2]), zoom), zoom, { duration: 1.2 }); // the glide, as in Google Maps
  };
  useEffect(() => {
    const map = mapRef.current;
    meMarker.current?.remove(); meMarker.current = null;
    if (!map || !me) return;
    // "Near me" from far away (planning a trip from home): the list sorts by distance, but the map stays on the region.
    if (me.far && me.intent === "near") return;
    const at: L.LatLngTuple = [me.lat, me.lng];
    const b = stateBounds.current;
    if (b && !b.contains(at)) {
      const wider = L.latLngBounds(b.getSouthWest(), b.getNorthEast()).extend(at);
      stateBounds.current = wider;
      map.setMaxBounds(wider.pad(0.6));
      fitMinZoom(map);
    }
    meMarker.current = L.circleMarker(at, { radius: 8, weight: 3, color: "#ffffff", fillColor: "#1a73e8", fillOpacity: 1, interactive: false }).addTo(map);
    const { top, bottom } = insetsRef.current;
    const chosen = selectedRef.current ? pins.current.get(selectedRef.current) : null;
    if (me.intent === "fit" && chosen) { // a place is open: show you and the place together, so the distance can be seen
      map.flyToBounds(L.latLngBounds([at, chosen.getLatLng()]), { paddingTopLeft: [40, top + 24], paddingBottomRight: [40, bottom + 24], maxZoom: 16, duration: 0.6 });
      return;
    }
    if (me.intent === "quiet") return; // only the blue dot: the map stays where it is
    if (me.intent === "near") return void zoomIn(map, at, 13);
    // The GPS button: glide in to you at a modest zoom. The next tap on the button glides back out (see toggleLocate).
    zoomIn(map, at, Math.max(map.getZoom(), 15));
    if (me.intent === "map") { zoomedRef.current = true; setZoomedToMe(true); }
  }, [me, ready]);

  // If the GPS could not be read, forget the view that was saved for the way back
  useEffect(() => { if (!locating && !zoomedRef.current) prevView.current = null; }, [locating]);

  // The GPS button, like Google Maps: first tap zooms in on you, the next tap zooms back out to where you were.
  // If you have moved the map away from yourself while zoomed in, the tap brings you back to the blue dot instead.
  const toggleLocate = () => {
    const map = mapRef.current;
    if (!map) return;
    if (zoomedRef.current && me) {
      const away = map.latLngToContainerPoint([me.lat, me.lng]).distanceTo(map.getSize().divideBy(2));
      if (away > 90) return void zoomIn(map, [me.lat, me.lng], map.getZoom());
      const back = prevView.current;
      zoomedRef.current = false; setZoomedToMe(false); prevView.current = null;
      if (back) map.flyTo(back.center, back.zoom, { duration: 1.2 });
      return;
    }
    prevView.current = { center: map.getCenter(), zoom: map.getZoom() };
    if (me?.at && Date.now() - me.at < 30000) { // a recent reading: no need to ask the GPS again
      zoomedRef.current = true; setZoomedToMe(true);
      zoomIn(map, [me.lat, me.lng], Math.max(map.getZoom(), 15));
    } else onLocate?.();
  };

  // A dashed line from you to the open place, labelled with the distance
  const meLine = useRef<L.Polyline | null>(null);
  useEffect(() => {
    const map = mapRef.current, m = selectedId ? pins.current.get(selectedId) : null;
    meLine.current?.remove();
    meLine.current = null;
    if (!map || !me || !m || !meMarker.current) return; // the marker only exists when you are inside the area the map shows
    const to = m.getLatLng();
    const dist = distanceKm(me, { lat: to.lat, lng: to.lng });
    meLine.current = L.polyline([[me.lat, me.lng], to], { color: token("--text"), weight: 2, dashArray: "6 6", interactive: false })
      .bindTooltip(formatDistance(dist), { permanent: true, direction: "center", className: "dist-label" }).addTo(map);
  }, [me, selectedId, ready]);

  // The open place's own pin (see selectedIcon). It is rebuilt only when what it shows changes, so a data refresh doesn't replay the drop.
  const selMarker = useRef<{ key: string; marker: L.Marker } | null>(null);
  const selPlace = selectedId ? places.find(p => p.id === selectedId) : undefined;

  // Selecting a place flies to it, placing the pin in the part of the map the panels don't cover
  useEffect(() => {
    const map = mapRef.current, m = selectedId ? pins.current.get(selectedId) : null;
    if (!map || !m) return;
    const zoom = Math.max(map.getZoom(), 14), { top, bottom } = insetsRef.current;
    const centre = map.unproject(map.project(m.getLatLng(), zoom).add([0, (bottom - top) / 2]), zoom);
    map.flyTo(centre, zoom, { duration: 0.6 }); // the selected pin is drawn above any group, so there is no need to zoom further to open one
  }, [selectedId, focusTick, !!selPlace, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- a place opened from a link: fly once its pin and the map exist
  const selCat = selPlace ? categories[selPlace.category] ?? fallbackCategory() : null;
  const selKey = selPlace && selCat ? [selPlace.id, selPlace.lat, selPlace.lng, selPlace.name, selCat.icon, selCat.color, closedIds?.has(selPlace.id) ? 1 : 0, ready].join("|") : "";
  useEffect(() => {
    const map = mapRef.current;
    if (selMarker.current?.key === selKey && map?.hasLayer(selMarker.current.marker)) return;
    selMarker.current?.marker.remove();
    selMarker.current = null;
    if (!map || !selPlace || !selCat) return;
    const id = selPlace.id;
    const marker = L.marker([selPlace.lat, selPlace.lng], { icon: selectedIcon(selCat.icon, selCat.color, selPlace.name, !!closedIds?.has(id)), pane: "selected", keyboard: false, title: selPlace.name })
      .on("click", () => onSelectRef.current(id)).addTo(map);
    selMarker.current = { key: selKey, marker };
  }, [selKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { selMarker.current?.marker.remove(); selMarker.current = null; }, []);

  // When a place is opened from an address, the list sheet rises a moment after the map has already flown to the pin, so the pin can end up
  // under the sheet. Once everything has settled, nudge the map (without animation: nothing else is moving) if the pin is not in view.
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      const map = mapRef.current, m = pins.current.get(selectedId);
      if (!map || !m) return;
      try {
        const { top, bottom } = insetsRef.current, size = map.getSize();
        const at = map.latLngToContainerPoint(m.getLatLng());
        if (at.y > top + 24 && at.y < size.y - bottom - 24 && at.x > 0 && at.x < size.x) return; // already in the visible part
        const zoom = map.getZoom();
        map.panTo(map.unproject(map.project(m.getLatLng(), zoom).add([0, (bottom - top) / 2]), zoom), { animate: false });
      } catch { /* the map was being rebuilt: nothing to move */ }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [selectedId, insets.top, insets.bottom]);

  // "My trip": a line through the stops in visiting order
  const routeLine = useRef<L.Polyline | null>(null);
  const routeKey = route?.map(r => `${r.lat},${r.lng}`).join("|") ?? "";
  useEffect(() => {
    const map = mapRef.current;
    routeLine.current?.remove();
    routeLine.current = null;
    if (!map || !route || route.length < 2) return;
    routeLine.current = L.polyline(route.map(r => [r.lat, r.lng] as L.LatLngTuple), { color: token("--accent"), weight: 4, opacity: 0.85, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(map);
    return () => { routeLine.current?.remove(); routeLine.current = null; };
  }, [routeKey, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // The layers menu never grows taller than the part of the map the list and filters leave free
  const [menuMax, setMenuMax] = useState(260);
  useEffect(() => {
    if (!menu) return;
    const h = host.current?.clientHeight ?? 0;
    setMenuMax(Math.max(120, h - insets.top - insets.bottom - 80));
  }, [menu, insets.top, insets.bottom]);

  // Saves the tiles of the map as it is now (and a little closer in) for offline use. A few dozen pictures, like panning around would load;
  // OpenStreetMap's rules rule out downloading a whole region at once.
  const [saving, setSaving] = useState(false);
  const saveView = async () => {
    const map = mapRef.current;
    if (!map || style !== "detailed" || saving) return;
    if (!navigator.onLine) return void notify("You're offline. Open this area while connected to save it.", "error");
    const b = map.getBounds(), z0 = Math.round(map.getZoom());
    const urls: string[] = [];
    for (const z of [z0, z0 + 1, z0 + 2]) {
      if (z > 18) break;
      const x0 = lon2tile(b.getWest(), z), x1 = lon2tile(b.getEast(), z), y0 = lat2tile(b.getNorth(), z), y1 = lat2tile(b.getSouth(), z);
      if (urls.length && urls.length + (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_OFFLINE_TILES) break;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(TILES.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)).replace("{s}", "a").replace("{r}", ""));
    }
    if (urls.length > MAX_OFFLINE_TILES) return void notify("Zoom in a little first: this view is too wide to save.", "error");
    setSaving(true);
    let saved = 0;
    const queue = [...urls];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try { const r = await fetch(u, { mode: "cors", credentials: "omit" }); if (r.ok) saved++; } catch { /* a tile that fails is just not saved */ }
      }
    }));
    setSaving(false);
    void notify(saved ? `Saved ${saved} map pieces for offline use on this device.` : "Couldn't save the map. Check your connection.", saved ? "info" : "error");
  };

  const choose = (s: MapStyle) => { setStyle(s); store.set("map-style", s); };

  return (
    <>
      <div ref={host} className="map" role="region" aria-label={`Map of ${state.name}`} />
      {onLocate && (
        <div className="map-locate">
          <button type="button" className={"map-layers" + (zoomedToMe ? " on" : "")} aria-pressed={zoomedToMe} aria-label={zoomedToMe ? "Zoom back out" : "Zoom to my location"} title={zoomedToMe ? "Zoom back out" : "My location"} disabled={locating} onClick={toggleLocate}>
            <Icon name="locate" />
          </button>
        </div>
      )}
      <div className="map-style" ref={menuRef}>
        <button type="button" className="map-layers" aria-label="Map layers" aria-expanded={menu} onClick={() => setMenu(v => !v)}><Icon name="layers" /></button>
        {menu && (
          <div className="map-style-menu" role="group" aria-label="Map layers" style={{ maxHeight: menuMax }}>
            <p className="mm-h" id="mm-base">Map style</p>
            <div className="mm-row" role="radiogroup" aria-labelledby="mm-base">
              <button type="button" className="chip" role="radio" aria-checked={style === "detailed"} onClick={() => choose("detailed")}>Streets</button>
              <button type="button" className="chip" role="radio" aria-checked={style === "simple"} onClick={() => choose("simple")}>Simple</button>
            </div>
            <p className="mm-h">Show</p>
            <button type="button" className="chip" aria-pressed={showDistricts} onClick={() => { setShowDistricts(v => !v); store.set("map-districts", showDistricts ? "off" : "on"); }}>
              {showDistricts && <Icon name="check" size={16} />} District borders
            </button>
            <p className="mm-h">Offline</p>
            <button type="button" className="chip" disabled={saving || style !== "detailed"} onClick={() => void saveView()} title={style === "detailed" ? "Keeps the map you see now, and a little closer in, on this device" : "Switch to Streets to save map pictures"}>
              <Icon name="offline" size={16} /> {saving ? "Saving…" : "Save this view"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
