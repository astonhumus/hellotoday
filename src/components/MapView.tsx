import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Category, Place, StateInfo } from "../types";
import { formatCoords } from "../lib/coords";
import { appleMapsUrl, googleMapsUrl } from "../lib/nav";
import { loadJson } from "../lib/data";

interface Props {
  state: StateInfo;
  places: Place[];
  categories: Record<string, Category>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const FALLBACK: Category = { id: "", label: "Place", color: "#64748b", icon: "📍" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

function buildPopup(p: Place, cat: Category): HTMLElement {
  const coords = formatCoords(p.lat, p.lng);
  const copy = el("button", { type: "button", className: "popup-copy", title: "Copy coordinates" }, "Copy");
  copy.addEventListener("click", () => {
    navigator.clipboard?.writeText(coords).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy"), 1500); });
  });
  const link = (href: string, label: string) =>
    el("a", { href, target: "_blank", rel: "noopener", className: "popup-btn" }, label);

  return el("div", { className: "popup" },
    el("b", {}, p.name),
    el("div", { className: "popup-meta" }, `${cat.icon} ${cat.label}${p.district ? " · " + p.district : ""}`),
    el("div", { className: "popup-coords" }, el("code", {}, coords), copy),
    p.approx ? el("div", { className: "popup-meta" }, "📍 Approximate location") : "",
    p.visited ? el("div", { className: "popup-meta" }, `✅ Visited ${p.visited}`) : "",
    p.notes ? el("div", {}, p.notes) : "",
    el("div", { className: "popup-actions" }, link(googleMapsUrl(p.lat, p.lng), "Google Maps ↗"), link(appleMapsUrl(p.lat, p.lng, p.name), "Apple Maps ↗"))
  );
}

export function MapView({ state, places, categories, selectedId, onSelect }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pins = useRef(new Map<string, L.CircleMarker>());
  const pinLayer = useRef<L.FeatureGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // The base map: country borders + state borders, no tiles, so it works fully offline.
  useEffect(() => {
    if (!host.current) return;
    const map = L.map(host.current, { preferCanvas: true, zoomSnap: 0.5, worldCopyJump: false })
      .setView(state.center, state.zoom);
    mapRef.current = map;
    pinLayer.current = L.featureGroup().addTo(map);
    let cancelled = false;

    Promise.all([loadJson<any>("world.json"), loadJson<any>("india-states.json")]).then(([world, india]) => {
      if (cancelled) return;
      L.geoJSON(world, { interactive: false, style: { color: "#9aa69f", weight: 0.8, fillColor: "#e9e7df", fillOpacity: 1 } }).addTo(map).bringToBack();
      L.geoJSON(india, { interactive: false, style: { color: "#b4bdb7", weight: 0.8, fillColor: "#efede6", fillOpacity: 1 } }).addTo(map);
      const mine = india.features.filter((f: any) => f.properties.name === state.name);
      const outline = L.geoJSON({ type: "FeatureCollection", features: mine } as any, {
        interactive: false, style: { color: "#1f7a5a", weight: 2, fillColor: "#dcefe6", fillOpacity: 1 }
      }).addTo(map);
      if (mine.length) {
        const bounds = outline.getBounds();
        map.fitBounds(bounds, { padding: [20, 20] });
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
      }).bindPopup(() => buildPopup(p, cat), { minWidth: 210 });
      m.on("click", () => onSelectRef.current(p.id));
      group.addLayer(m);
      pins.current.set(p.id, m);
    });
    if (places.length) map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 11 });
  }, [places, categories, state]);

  // Selecting a place from the list flies to its pin and opens it
  useEffect(() => {
    const map = mapRef.current, m = selectedId ? pins.current.get(selectedId) : null;
    if (!map || !m) return;
    map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 10), { duration: 0.6 });
    m.openPopup();
  }, [selectedId]);

  return <div ref={host} className="map" role="region" aria-label={`Map of ${state.name}`} />;
}
