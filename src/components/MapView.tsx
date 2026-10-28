import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Category, Place, StateInfo } from "../types";
import { formatCoords } from "../lib/coords";
import { appleMapsUrl, googleMapsUrl } from "../lib/nav";
import { loadJson, store } from "../lib/data";

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
  isVisited: (id: string) => boolean;
  onToggleVisited: (id: string) => void;
  focusTick?: number; // changes when the same place is tapped again, so the map re-centres on it
  onSelect: (id: string) => void;
}

const FALLBACK: Category = { id: "", label: "Place", color: "#64748b", icon: "📍" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function buildPopup(p: Place, cat: Category, isVisited: boolean, toggleVisited: (id: string) => void): HTMLElement {
  const coords = formatCoords(p.lat, p.lng);
  const copy = el("button", { type: "button", className: "popup-copy", title: "Copy coordinates" }, "Copy");
  copy.addEventListener("click", () => {
    navigator.clipboard?.writeText(coords).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); });
  });
  let on = isVisited;
  const label = () => (on ? "✅ You visited. Tap to undo" : "☐ Mark as visited");
  const visit = el("button", { type: "button", className: "popup-visit", textContent: label() });
  visit.addEventListener("click", () => { toggleVisited(p.id); on = !on; visit.textContent = label(); });
  const link = (href: string, label: string) =>
    el("a", { href, target: "_blank", rel: "noopener", className: "popup-btn" }, label);

  return el("div", { className: "popup" },
    el("b", {}, p.name),
    el("div", { className: "popup-meta" }, `${cat.icon} ${cat.label}${p.district ? " · " + p.district : ""}`),
    el("div", { className: "popup-coords" }, el("code", {}, coords), copy),
    p.approx ? el("div", { className: "popup-meta" }, "📍 Approximate location") : "",
    p.visited ? el("div", { className: "popup-meta" }, `📝 Editor visited ${p.visited}`) : "",
    p.notes ? el("div", {}, p.notes) : "",
    visit,
    el("div", { className: "popup-actions" }, link(googleMapsUrl(p.lat, p.lng), "Google Maps ↗"), link(appleMapsUrl(p.lat, p.lng, p.name), "Apple Maps ↗"))
  );
}

export function MapView({ state, places, categories, selectedId, focusTick, isVisited, onToggleVisited, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.CircleMarker>());
  const pinLayer = useRef<L.FeatureGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const visitedRef = useRef({ isVisited, onToggleVisited });
  visitedRef.current = { isVisited, onToggleVisited };
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const tileLayer = useRef<L.TileLayer | null>(null);
  const [style, setStyle] = useState<MapStyle>(() => (store.get("map-style") === "simple" ? "simple" : "detailed"));
  const [showDistricts, setShowDistricts] = useState(() => store.get("map-districts") !== "off");
  const [districtData, setDistrictData] = useState<any>(null);
  const districtLayer = useRef<L.GeoJSON | null>(null);
  const stateStroke = useRef<L.GeoJSON | null>(null);
  const haveDistrictOutline = useRef(false);
  const [ready, setReady] = useState(0); // bumps when the map is rebuilt, so the tiles are re-added

  // Border maps below the street tiles: they show through wherever a tile can't be loaded (offline, not cached yet).
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { preferCanvas: true, zoomSnap: 0.5, worldCopyJump: false })
      .setView(state.center, state.zoom);
    map.createPane("borders").style.zIndex = "150";   // under the tile pane (200)
    map.createPane("outline").style.zIndex = "250";   // over the tiles
    mapRef.current = map;
    setReady(n => n + 1);
    pinLayer.current = L.featureGroup().addTo(map);
    let cancelled = false;

    Promise.all([loadJson<any>("world.json"), loadJson<any>("india-states.json")]).then(([world, india]) => {
      if (cancelled) return;
      L.geoJSON(world, { pane: "borders", interactive: false, style: { color: "#9aa69f", weight: 0.8, fillColor: "#e9e7df", fillOpacity: 1 } }).addTo(map);
      L.geoJSON(india, { pane: "borders", interactive: false, style: { color: "#b4bdb7", weight: 0.8, fillColor: "#efede6", fillOpacity: 1 } }).addTo(map);
      const mine = india.features.filter((f: any) => f.properties.name === state.name);
      const fc = { type: "FeatureCollection", features: mine } as any;
      L.geoJSON(fc, { pane: "borders", interactive: false, style: { color: "#1f7a5a", weight: 2, fillColor: "#dcefe6", fillOpacity: 1 } }).addTo(map);
      // Green state boundary stays visible on top of the street map.
      const outline = L.geoJSON(fc, { pane: "outline", interactive: false, style: { color: "#1f7a5a", weight: 2.5, fill: false } });
      if (!haveDistrictOutline.current) { outline.addTo(map); stateStroke.current = outline; }
      if (mine.length) {
        const bounds = outline.getBounds();
        try { map.fitBounds(bounds, { padding: [20, 20] }); } catch { /* container not measurable yet; the resize observer refits */ }
        map.setMinZoom(map.getZoom() - 1);
        map.setMaxBounds(bounds.pad(0.6));
      }
      pinLayer.current?.bringToFront();
    }).catch(() => {});

    // The map may be hidden (mobile List view) and shown later, or resized by rotating the phone.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(host.current);

    return () => { cancelled = true; ro.disconnect(); map.remove(); mapRef.current = null; pins.current.clear(); };
  }, [state]);

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
    const line = L.geoJSON(districtData.outline, { pane: "outline", interactive: false, style: { color: "#1f7a5a", weight: 2.5, fill: false } }).addTo(map);
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
      style: { color: "#4b5563", weight: 1.3, opacity: 0.85, dashArray: "6 4", fill: false },
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
    group.clearLayers();
    pins.current.clear();
    places.forEach(p => {
      const cat = categories[p.category] ?? FALLBACK;
      const m = L.circleMarker([p.lat, p.lng], {
        radius: 8, weight: 2, color: "#fff", fillColor: cat.color, fillOpacity: 0.95
      }).bindPopup(() => buildPopup(p, cat, visitedRef.current.isVisited(p.id), visitedRef.current.onToggleVisited), { minWidth: 210 });
      m.on("click", () => onSelectRef.current(p.id));
      group.addLayer(m);
      pins.current.set(p.id, m);
    });
    // Keep the open popup across filter changes; only re-zoom (after typing pauses) when nothing is selected.
    const keep = selectedRef.current ? pins.current.get(selectedRef.current) : undefined;
    if (keep) { keep.openPopup(); return; }
    const t = setTimeout(() => {
      if (places.length && map.getSize().x > 0) {
        try { map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 11 }); } catch { /* ignore */ }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [places, categories, state]);

  // Selecting a place from the list flies to its pin and opens it
  useEffect(() => {
    const map = mapRef.current, m = selectedId ? pins.current.get(selectedId) : null;
    if (!map || !m) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 10), { duration: 0.6 });
    m.openPopup();
  }, [selectedId, focusTick]);

  const choose = (s: MapStyle) => { setStyle(s); store.set("map-style", s); };

  return (
    <>
      <div ref={host} className="map" role="region" aria-label={`Map of ${state.name}`} />
      <div className="map-style" role="group" aria-label="Map style">
        <button className="chip" aria-pressed={style === "detailed"} onClick={() => choose("detailed")}>Streets</button>
        <button className="chip" aria-pressed={style === "simple"} onClick={() => choose("simple")}>Simple</button>
        <button className="chip" aria-pressed={showDistricts} onClick={() => { setShowDistricts(v => !v); store.set("map-districts", showDistricts ? "off" : "on"); }}>Districts</button>
      </div>
    </>
  );
}
