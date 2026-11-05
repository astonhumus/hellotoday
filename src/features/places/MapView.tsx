import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Category, Place, StateInfo } from "../../types";
import { loadJson, store } from "../../lib/data";
import { Icon } from "../../ui/Icon";
import { iconSvg } from "../../ui/icons";
import { distanceKm, formatKm } from "../../lib/geo";
import { useTheme } from "../../lib/theme";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";

// Street map: roads, localities and landmarks from OpenStreetMap. Viewed tiles are cached for offline use (see vite.config.ts).
// Set VITE_TILE_URL to use another provider (e.g. MapTiler) if traffic grows; OpenStreetMap's free servers are for modest use.
const TILES = import.meta.env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const LABEL_MIN_ZOOM = 9; // district names appear from this zoom, so they don't pile up over Imphal
type MapStyle = "detailed" | "simple";

interface Props {
  state: StateInfo;
  places: Place[];
  categories: Record<string, Category>;
  selectedId: string | null;
  visitedIds: Set<string>;
  me?: { lat: number; lng: number; accuracy?: number; intent?: "map" | "fit" | "near"; at?: number } | null; // the visitor's own GPS position (intent: why it was asked for)
  insets: { top: number; bottom: number }; // screen covered by the search bar and the bottom sheet (phones)
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
const mapProto = L.Map.prototype as unknown as { _onZoomTransitionEnd: () => void; _mapPane?: unknown; _zoomGuarded?: boolean };
if (!mapProto._zoomGuarded) {
  const done = mapProto._onZoomTransitionEnd;
  mapProto._onZoomTransitionEnd = function (this: typeof mapProto) { if (!this._mapPane) return; done.call(this); };
  mapProto._zoomGuarded = true;
}

// Leaflet draws to canvas/SVG and can't read CSS variables, so the theme tokens are read once here.
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const fallbackCategory = (): Category => ({ id: "", label: "Place", color: "", icon: "pin" });

// A place is a neutral round pin with its category glyph; the selected one fills with the accent, visited ones get an accent ring.
type PinState = "plain" | "visited" | "selected";
const pinIcon = (glyph: string, state: PinState) => {
  const size = state === "selected" ? 38 : 26;
  return L.divIcon({ className: "pin-wrap", html: `<span class="pin ${state}">${iconSvg(glyph, state === "selected" ? 20 : 14)}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

export function MapView({ state, places, categories, selectedId, focusTick, visitedIds, me, insets, onSelect, onLocate, locating }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.Marker>());
  const pinState = useRef(new Map<string, { glyph: string; state: PinState }>());
  const pinLayer = useRef<L.MarkerClusterGroup | null>(null);
  const theme = useTheme(); // the map reads its colours when it is built, so a theme change rebuilds it
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const tileLayer = useRef<L.TileLayer | null>(null);
  const [style, setStyle] = useState<MapStyle>(() => (store.get("map-style") === "simple" ? "simple" : "detailed"));
  const [showDistricts, setShowDistricts] = useState(() => store.get("map-districts") !== "off");
  const [districtData, setDistrictData] = useState<any>(null);
  const districtLayer = useRef<L.GeoJSON | null>(null);
  const stateStroke = useRef<L.GeoJSON | null>(null);
  const haveDistrictOutline = useRef(false);
  const stateBounds = useRef<L.LatLngBounds | null>(null);
  const lastFit = useRef("");            // which set of places the map was last fitted to, so a data refresh doesn't move the map
  const fitMinZoom = (map: L.Map) => { if (stateBounds.current) map.setMinZoom(Math.max(0, map.getBoundsZoom(stateBounds.current) - 1)); };
  const [menu, setMenu] = useState(false); // the layers menu
  const [ready, setReady] = useState(0); // bumps when the map is rebuilt, so the tiles are re-added

  // Border maps below the street tiles: they show through wherever a tile can't be loaded (offline, not cached yet).
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { preferCanvas: true, zoomSnap: 0.5, worldCopyJump: false, maxZoom: 18 }) // maxZoom is needed up front by the pin clusters
      .setView(state.center, state.zoom);
    map.createPane("borders").style.zIndex = "150";   // under the tile pane (200)
    map.createPane("outline").style.zIndex = "250";   // over the tiles
    mapRef.current = map;
    const host0 = host.current;
    const mark = () => { host0.dataset.zoom = String(map.getZoom()); }; // the current zoom, readable from outside (tests, debugging)
    map.on("zoomend", mark); mark();
    prevView.current = null; zoomedRef.current = false; setZoomedToMe(false);
    setReady(n => n + 1);
    // Pins that overlap merge into a numbered circle (tap to zoom in), so a crowded town stays readable and fast.
    pinLayer.current = L.markerClusterGroup({
      showCoverageOnHover: false, maxClusterRadius: 44, disableClusteringAtZoom: 16, chunkedLoading: true,
      iconCreateFunction: c => L.divIcon({ html: `<span class="cluster">${c.getChildCount()}</span>`, className: "cluster-wrap", iconSize: [40, 40] })
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
      try { map.fitBounds(bounds, { padding: [20, 20] }); } catch { /* container not measurable yet; the resize observer refits */ }
      fitMinZoom(map);
      map.setMaxBounds(bounds.pad(0.6));
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
        try { map.fitBounds(bounds, { padding: [20, 20] }); } catch { /* container not measurable yet; the resize observer refits */ }
        fitMinZoom(map);
        map.setMaxBounds(bounds.pad(0.6));
      }
    };

    // The map may be hidden (mobile List view) and shown later, or resized by rotating the phone.
    const ro = new ResizeObserver(() => { map.invalidateSize(); fitMinZoom(map); }); // rotating the phone changes how far out the map may zoom
    ro.observe(host.current);

    return () => { cancelled = true; ro.disconnect(); map.stop(); map.remove(); mapRef.current = null; pins.current.clear(); pinState.current.clear(); stateBounds.current = null; lastFit.current = ""; };
  }, [state, theme]);

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
    // Only add, move or remove the pins that actually changed, so a refresh or a keystroke doesn't rebuild hundreds of markers.
    const next = new Set(places.map(p => p.id));
    pins.current.forEach((m, id) => { if (!next.has(id)) { group.removeLayer(m); pins.current.delete(id); pinState.current.delete(id); } });
    places.forEach(p => {
      const glyph = (categories[p.category] ?? fallbackCategory()).icon;
      const have = pins.current.get(p.id), meta = pinState.current.get(p.id);
      if (have) {
        const ll = have.getLatLng();
        if (ll.lat !== p.lat || ll.lng !== p.lng) have.setLatLng([p.lat, p.lng]);
        if (meta && meta.glyph !== glyph) { have.setIcon(pinIcon(glyph, meta.state)); meta.glyph = glyph; }
        return;
      }
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(glyph, "plain"), keyboard: false });
      m.on("click", () => onSelectRef.current(p.id));
      group.addLayer(m);
      pins.current.set(p.id, m);
      pinState.current.set(p.id, { glyph, state: "plain" });
    });
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
      const state: PinState = id === selectedRef.current ? "selected" : visitedIds.has(id) ? "visited" : "plain";
      if (meta.state !== state) { m.setIcon(pinIcon(meta.glyph, state)); meta.state = state; }
      m.setZIndexOffset(state === "selected" ? 1000 : 0);
    });
  };
  useEffect(paint, [selectedId, visitedIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .bindTooltip(formatKm(dist), { permanent: true, direction: "center", className: "dist-label" }).addTo(map);
  }, [me, selectedId, ready]);

  // Selecting a place flies to it, placing the pin in the part of the map the panels don't cover
  useEffect(() => {
    const map = mapRef.current, m = selectedId ? pins.current.get(selectedId) : null;
    if (!map || !m) return;
    const zoom = Math.max(map.getZoom(), 14), { top, bottom } = insetsRef.current;
    const centre = map.unproject(map.project(m.getLatLng(), zoom).add([0, (bottom - top) / 2]), zoom);
    map.flyTo(centre, zoom, { duration: 0.6 });
    // If the pin is still folded into a cluster after arriving, open the cluster
    map.once("moveend", () => { const g = pinLayer.current; if (g && g.hasLayer(m) && g.getVisibleParent(m) !== m) g.zoomToShowLayer(m, () => {}); });
  }, [selectedId, focusTick]);

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
      <div className="map-style">
        <button type="button" className="map-layers" aria-label="Map layers" aria-expanded={menu} onClick={() => setMenu(v => !v)}><Icon name="layers" /></button>
        {menu && (
          <div className="map-style-menu" role="group" aria-label="Map layers">
            <button className="chip" aria-pressed={style === "detailed"} onClick={() => choose("detailed")}>Streets</button>
            <button className="chip" aria-pressed={style === "simple"} onClick={() => choose("simple")}>Simple</button>
            <button className="chip" aria-pressed={showDistricts} onClick={() => { setShowDistricts(v => !v); store.set("map-districts", showDistricts ? "off" : "on"); }}>Districts</button>
          </div>
        )}
      </div>
    </>
  );
}
