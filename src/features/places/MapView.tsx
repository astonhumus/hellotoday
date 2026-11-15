import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { LngLatBoundsLike, Map as MLMap, Marker, VectorTileSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Supercluster from "supercluster";
import type { Category, Place, StateInfo } from "../../types";
import { loadJson, store } from "../../lib/data";
import { Icon } from "../../ui/Icon";
import { iconSvg } from "../../ui/icons";
import { distanceKm } from "../../lib/geo";
import { formatDistance } from "../../lib/prefs";
import { notify } from "../../lib/ui";
import { useTheme } from "../../lib/theme";
import { formatMinutes, useRoadRoute } from "../../lib/roads";
import { aboveBackground, dropLayers, firstSymbol, labelPoint, lngLat, putLayer, putSource, simpleStyle, streetStyle, token } from "../../lib/mapStyle";

// Street map: OpenStreetMap data drawn live from vector tiles (see lib/mapStyle.ts), so it can turn like Google Maps with labels upright.
// Viewed tiles are cached for offline use (see vite.config.ts).
const MAX_OFFLINE_TILES = 150;
const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tile = (lat: number, z: number) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * 2 ** z);
const LABEL_MIN_ZOOM = 10; // district names appear from this zoom, so they don't pile up over Imphal
const CLUSTER_MAX_ZOOM = 15; // from zoom 16 every place has its own pin
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

const fallbackCategory = (): Category => ({ id: "", label: "Place", color: "", icon: "pin" });
const safeColor = (c?: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : ""); // goes into markup: only a plain hex colour
type PinState = "plain" | "visited" | "closed";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

// A place is a neutral round pin with its category glyph; visited ones get an accent ring. The circle is 26px; the tappable area 36px.
const PIN_BOX = 36;
function pinEl(glyph: string, state: PinState, color?: string) {
  const wrap = el("div", { className: "pin-wrap" });
  wrap.style.width = wrap.style.height = `${PIN_BOX}px`;
  fillPin(wrap, glyph, state, color);
  return wrap;
}
function fillPin(wrap: HTMLElement, glyph: string, state: PinState, color?: string) {
  const col = safeColor(color);
  wrap.innerHTML = `<span class="pin ${state}"${col ? ` style="--cat:${col}"` : ""}>${iconSvg(glyph, 14)}</span>`; // the app's own icon markup
}

/**
 * The open place, like a dropped pin in Google Maps: a large teardrop in the category's colour with its glyph, its tip exactly on the spot,
 * a soft pulse around the tip and the place's name beside it. It drops in when a place is chosen.
 */
const SEL_W = 48, SEL_H = 64, SEL_TIP = 58; // the tip sits 58px down the 64px box; the rest is room for the pulse below it
function selectedEl(glyph: string, color: string | undefined, name: string, closed: boolean) {
  const col = safeColor(color);
  const glyphEl = el("span", { className: "sel-glyph" });
  glyphEl.innerHTML = iconSvg(glyph, 20);
  const root = el("div", { className: "sel-pin" + (closed ? " closed" : "") },
    el("span", { className: "sel-shadow" }), el("span", { className: "sel-pulse" }),
    el("span", { className: "sel-body" }, el("span", { className: "sel-head" }, glyphEl), el("span", { className: "sel-label" }, name)));
  if (col) root.style.setProperty("--cat", col);
  const wrap = el("div", { className: "sel-wrap" }, root);
  wrap.style.width = `${SEL_W}px`; wrap.style.height = `${SEL_H}px`;
  return wrap;
}

/** A group of pins: the number of places in it, ringed in their categories' colours (one colour when they are all of one category). */
function clusterEl(byCat: [string, number][], total: number, cats: Record<string, Category>) {
  const parts = [...byCat].sort((a, b) => b[1] - a[1]);
  const colorOf = (id: string) => safeColor(cats[id]?.color) || "var(--text-2)";
  let at = 0;
  const ring = parts.map(([id, n]) => { const from = at; at += (n / total) * 100; return `${colorOf(id)} ${from.toFixed(2)}% ${at.toFixed(2)}%`; }).join(", ");
  const one = parts.length === 1 ? parts[0][0] : null;
  const size = total < 10 ? 36 : total < 100 ? 42 : 48;
  const what = one ? `${total} ${cats[one]?.label ?? "places"}` : `${total} places in ${parts.length} categories`;
  const span = el("span", { className: "cluster" + (one ? " one" : ""), title: `${what}. Tap to zoom in` }, el("b", {}, String(total)));
  span.style.cssText = `--ring: conic-gradient(${ring});${one ? ` --cat: ${colorOf(one)};` : ""} width:${size}px; height:${size}px`;
  return el("div", { className: "cluster-wrap" }, span);
}

type PinProps = Record<string, number>; // per category: "c_<id>" → how many places
type PointProps = { id: string; cat: string };

export function MapView({ state, places, categories, selectedId, free = false, focusTick, visitedIds, closedIds, me, route, insets, onSelect, onLocate, locating }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const theme = useTheme(); // the map reads its colours when it is built, so a theme change rebuilds it
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const insetsRef = useRef(insets);
  insetsRef.current = insets;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const freeRef = useRef(free);
  freeRef.current = free;
  const catsRef = useRef(categories);
  catsRef.current = categories;

  const [style, setStyle] = useState<MapStyle>(() => (store.get("map-style") === "simple" ? "simple" : "detailed"));
  const [fallback, setFallback] = useState(false); // the street map couldn't load (offline and never seen, server down): borders only
  const shown: MapStyle = fallback ? "simple" : style;
  const [showDistricts, setShowDistricts] = useState(() => store.get("map-districts") !== "off");
  const [districtData, setDistrictData] = useState<any>(null);
  const [ready, setReady] = useState(0); // bumps when a (re)built map has loaded its style, so layers and markers are added again
  const [bearing, setBearing] = useState(0); // how far the map is turned from north, in degrees
  const stateBounds = useRef<maplibregl.LngLatBounds | null>(null);
  const lastFit = useRef("");            // which set of places the map was last fitted to, so a data refresh doesn't move the map
  const view = useRef<{ id: string; center: [number, number]; zoom: number; bearing: number } | null>(null); // kept across a style/theme rebuild

  // The camera offset that puts a point in the middle of the part of the map the panels leave free (MapLibre turns it with the map).
  const offset = (): [number, number] => { const { top, bottom } = insetsRef.current; return [0, (top - bottom) / 2]; };
  const fitPadding = (extra = 16) => { const { top, bottom } = insetsRef.current; return { top: top + extra, bottom: bottom + extra, left: 40, right: 40 }; };

  const fitMinZoom = (map: MLMap) => {
    const b = stateBounds.current;
    if (!b || freeRef.current) return;
    const cam = map.cameraForBounds(b, { padding: 20, bearing: map.getBearing() });
    if (cam?.zoom == null) return;
    map.setMinZoom(Math.max(0, cam.zoom - 1));
  };
  const limitTo = (map: MLMap, b: maplibregl.LngLatBounds) => {
    const dx = (b.getEast() - b.getWest()) * 0.6, dy = (b.getNorth() - b.getSouth()) * 0.6;
    map.setMaxBounds([[b.getWest() - dx, Math.max(-85, b.getSouth() - dy)], [b.getEast() + dx, Math.min(85, b.getNorth() + dy)]]);
  };

  // The map itself. A new region, theme or map style builds a fresh one (keeping the view when only the look changed).
  useEffect(() => {
    if (!host.current) return;
    const keep = view.current?.id === state.id ? view.current : null;
    const bbox = state.bbox ? new maplibregl.LngLatBounds([state.bbox[1], state.bbox[0]], [state.bbox[3], state.bbox[2]]) : null;
    stateBounds.current = bbox;
    const map = new maplibregl.Map({
      container: host.current,
      style: shown === "detailed" ? streetStyle(theme) : simpleStyle(),
      ...(keep ? { center: keep.center, zoom: keep.zoom, bearing: keep.bearing }
        : bbox ? { bounds: bbox as LngLatBoundsLike, fitBoundsOptions: { padding: 20 } } : { center: [state.center[1], state.center[0]] as [number, number], zoom: state.zoom }),
      maxZoom: 18, maxPitch: 0, pitchWithRotate: false, touchPitch: false, // turn, but don't tilt
      attributionControl: false, fadeDuration: 150
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: 'Districts: <a href="https://www.geoboundaries.org" target="_blank" rel="noopener">geoBoundaries</a>' }), "bottom-right");
    const host0 = host.current;
    const mark = () => {
      host0.dataset.zoom = String(Math.round(map.getZoom() * 10) / 10); // the current zoom, readable from outside (tests, debugging)
      host0.classList.toggle("hide-district-labels", map.getZoom() < LABEL_MIN_ZOOM);
    };
    map.on("zoomend", mark); mark();
    map.on("rotate", () => setBearing(map.getBearing()));
    setBearing(keep?.bearing ?? 0);
    map.on("moveend", () => { const c = map.getCenter(); view.current = { id: state.id, center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing() }; });
    let loaded = false;
    map.on("load", () => {
      loaded = true;
      if (bbox && !freeRef.current) { limitTo(map, bbox); fitMinZoom(map); }
      setReady(n => n + 1);
    });
    // No street map (offline before it was ever seen, or its server is down): fall back to the borders-only map.
    map.on("error", () => { if (!loaded && shown === "detailed") setFallback(true); });
    const slow = window.setTimeout(() => { if (!loaded && shown === "detailed" && !navigator.onLine) setFallback(true); }, 4000);
    prevView.current = null; zoomedRef.current = false; setZoomedToMe(false);

    // The map may be hidden (mobile List view) and shown later, or resized by rotating the phone.
    const ro = new ResizeObserver(() => { map.resize(); fitMinZoom(map); });
    ro.observe(host0);
    return () => {
      window.clearTimeout(slow); ro.disconnect();
      markers.current.clear(); selMarker.current = null; meMarker.current = null; meLabel.current = null; districtLabels.current = [];
      map.remove(); mapRef.current = null;
    };
  }, [state, theme, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new region: fit to its places again.
  useEffect(() => { lastFit.current = ""; }, [state.id]);

  // "All regions": lift the limits that keep the map on the chosen region, and put them back when it is turned off.
  const freeSeen = useRef(free);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (free) { map.setMaxBounds(null); map.setMinZoom(2); freeSeen.current = true; return; }
    const b = stateBounds.current;
    if (!b) return;
    limitTo(map, b); fitMinZoom(map);
    // Coming back from "All regions": show the region again (an open place keeps the map on it)
    if (freeSeen.current && !selectedRef.current) map.fitBounds(b, { padding: 20, bearing: map.getBearing() });
    freeSeen.current = false;
  }, [free, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Borders: the world and every state/province of the country under the street map (they show through wherever a tile is missing),
  // the chosen region highlighted, and its outline over the street map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let live = true;
    Promise.all([loadJson<any>("world.json"), loadJson<any>(`regions/${state.country ?? "IND"}.json`)]).then(([world, regions]) => {
      if (!live || mapRef.current !== map) return;
      const mine = { type: "FeatureCollection", features: regions.features.filter((f: any) => f.properties.id === state.id) } as GeoJSON.FeatureCollection;
      putSource(map, "b-world", world); putSource(map, "b-regions", regions); putSource(map, "b-mine", mine);
      const under = aboveBackground(map), over = firstSymbol(map);
      putLayer(map, { id: "b-world", type: "fill", source: "b-world", paint: { "fill-color": token("--surface-2"), "fill-outline-color": token("--border-strong") } }, under);
      putLayer(map, { id: "b-regions", type: "fill", source: "b-regions", paint: { "fill-color": token("--surface") } }, under);
      putLayer(map, { id: "b-regions-line", type: "line", source: "b-regions", paint: { "line-color": token("--border-strong"), "line-width": 0.8 } }, under);
      putLayer(map, { id: "b-mine", type: "fill", source: "b-mine", paint: { "fill-color": token("--accent-wash") } }, under);
      // The green region outline, over the street map (the district file's own outline replaces it when there is one)
      putLayer(map, { id: "b-mine-line", type: "line", source: "b-mine", layout: { visibility: map.getLayer("d-outline") ? "none" : "visible" }, paint: { "line-color": token("--accent"), "line-width": 2.5 } }, over);
      if (mine.features.length && !state.bbox && view.current?.id !== state.id) {
        const b = new maplibregl.LngLatBounds();
        JSON.stringify(mine.features.map(f => f.geometry)).match(/-?\d+(\.\d+)?,-?\d+(\.\d+)?/g)?.forEach(pair => { const [x, y] = pair.split(",").map(Number); b.extend([x, y]); });
        stateBounds.current = b;
        map.fitBounds(b, { padding: 20, animate: false });
        if (!freeRef.current) { limitTo(map, b); fitMinZoom(map); }
      }
    }).catch(() => {});
    return () => { live = false; };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // District boundaries (public/data/<state>/districts.json), drawn over the street map with the district names.
  useEffect(() => {
    setDistrictData(null);
    loadJson<any>(`${state.id}/districts.json`).then(setDistrictData).catch(() => {});
  }, [state.id]);

  const districtLabels = useRef<Marker[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const over = firstSymbol(map);
    // The green state line is merged from the district shapes (scripts/build-outline.mjs), so it matches the dashed lines exactly.
    if (districtData?.outline) {
      putSource(map, "d-outline", districtData.outline);
      putLayer(map, { id: "d-outline", type: "line", source: "d-outline", paint: { "line-color": token("--accent"), "line-width": 2.5 } }, over);
      if (map.getLayer("b-mine-line")) map.setLayoutProperty("b-mine-line", "visibility", "none");
    }
    districtLabels.current.forEach(m => m.remove());
    districtLabels.current = [];
    dropLayers(map, "d-lines");
    if (!showDistricts || !districtData) return;
    putSource(map, "d-lines", districtData);
    putLayer(map, { id: "d-lines", type: "line", source: "d-lines", paint: { "line-color": token("--text-2"), "line-width": 1.3, "line-opacity": 0.85, "line-dasharray": [4, 3] } }, over);
    // Names as little HTML labels: they always stay upright, however the map is turned.
    districtLabels.current = (districtData.features as any[]).flatMap(f => {
      const at = labelPoint(f.geometry);
      return at ? [new maplibregl.Marker({ element: el("span", { className: "district-label" }, String(f.properties.name)) }).setLngLat(at).addTo(map)] : [];
    });
    return () => { districtLabels.current.forEach(m => m.remove()); districtLabels.current = []; };
  }, [showDistricts, districtData, ready]);

  // ── Pins ──
  // Pins that overlap merge into a numbered circle (tap to zoom in), so a crowded town stays readable and fast.
  // The number counts only the places shown (the chosen categories and filters), and the circle wears their categories' colours.
  const unique = useMemo(() => [...new Map(places.map(p => [p.id, p])).values()], [places]);
  const index = useMemo(() => {
    const sc = new Supercluster<PointProps, PinProps>({
      radius: 44, maxZoom: CLUSTER_MAX_ZOOM,
      map: p => ({ [`c_${p.cat}`]: 1 }),
      reduce: (acc, p) => { for (const k in p) if (k.startsWith("c_")) acc[k] = (acc[k] ?? 0) + p[k]; }
    });
    sc.load(unique.map(p => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, cat: p.category } })));
    return sc;
  }, [unique]);
  const indexRef = useRef(index);
  indexRef.current = index;
  const byId = useMemo(() => new Map(unique.map(p => [p.id, p])), [unique]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  const looks = useRef({ visitedIds, closedIds });
  looks.current = { visitedIds, closedIds };

  const markers = useRef(new Map<string, { m: Marker; sig: string }>());
  const drawPins = () => {
    const map = mapRef.current;
    if (!map) return;
    const want = new Set<string>();
    // With a place open, only that place is shown, as in Google Maps: no other pins, no numbered groups.
    if (!selectedRef.current) {
      const b = map.getBounds(), z = Math.floor(map.getZoom());
      const dx = (b.getEast() - b.getWest()) * 0.25, dy = (b.getNorth() - b.getSouth()) * 0.25;
      const feats = indexRef.current.getClusters([Math.max(-180, b.getWest() - dx), Math.max(-85, b.getSouth() - dy), Math.min(180, b.getEast() + dx), Math.min(85, b.getNorth() + dy)], z);
      const cats = catsRef.current;
      for (const f of feats) {
        const [lng, lat] = f.geometry.coordinates as [number, number];
        const props = f.properties as Record<string, any>;
        if (props.cluster) {
          const key = `c${props.cluster_id}`;
          const byCat = Object.entries(props).filter(([k]) => k.startsWith("c_")).map(([k, n]) => [k.slice(2), n as number] as [string, number]);
          const sig = `${props.point_count}|${byCat.map(([k, n]) => `${k}:${n}:${cats[k]?.color ?? ""}`).join(",")}`;
          want.add(key);
          const have = markers.current.get(key);
          if (have && have.sig === sig) continue;
          have?.m.remove();
          const node = clusterEl(byCat, props.point_count, cats);
          node.addEventListener("click", e => {
            e.stopPropagation();
            const zoom = Math.min(indexRef.current.getClusterExpansionZoom(props.cluster_id), CLUSTER_MAX_ZOOM + 1);
            map.easeTo({ center: [lng, lat], zoom, duration: 500 });
          });
          markers.current.set(key, { m: new maplibregl.Marker({ element: node }).setLngLat([lng, lat]).addTo(map), sig });
        } else {
          const p = byIdRef.current.get(props.id);
          if (!p) continue;
          const key = `p${p.id}`;
          const cat = cats[p.category] ?? fallbackCategory();
          const st: PinState = looks.current.closedIds?.has(p.id) ? "closed" : looks.current.visitedIds.has(p.id) ? "visited" : "plain";
          const sig = `${cat.icon}|${cat.color}|${st}|${lng},${lat}`;
          want.add(key);
          const have = markers.current.get(key);
          if (have) {
            if (have.sig !== sig) { fillPin(have.m.getElement(), cat.icon, st, cat.color); have.m.setLngLat([lng, lat]); have.sig = sig; }
            continue;
          }
          const node = pinEl(cat.icon, st, cat.color);
          node.title = p.name;
          node.addEventListener("click", e => { e.stopPropagation(); onSelectRef.current(p.id); });
          markers.current.set(key, { m: new maplibregl.Marker({ element: node }).setLngLat([lng, lat]).addTo(map), sig });
        }
      }
    }
    markers.current.forEach((v, k) => { if (!want.has(k)) { v.m.remove(); markers.current.delete(k); } });
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.on("moveend", drawPins);
    return () => { map.off("moveend", drawPins); };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) drawPins(); }, [index, selectedId, visitedIds, closedIds, categories, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-zoom only when the set of places really changed (a filter, a search), after typing pauses, and never while a place is selected.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const signature = places.map(p => p.id).sort().join("|");
    if (signature === lastFit.current) return;
    if (selectedRef.current && byId.has(selectedRef.current)) return;
    const t = setTimeout(() => {
      lastFit.current = signature;
      if (!places.length || !map.getContainer().clientWidth) return;
      const b = new maplibregl.LngLatBounds();
      places.forEach(p => b.extend([p.lng, p.lat]));
      try { map.fitBounds(b, { padding: fitPadding(), maxZoom: 11, bearing: map.getBearing() }); } catch { /* the panels leave no room */ }
    }, 300);
    return () => clearTimeout(t);
  }, [places, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // "You are here": a blue dot, like Google Maps. The map can always show you,
  // even when you are far outside the region: its limits are widened to take you in.
  const meMarker = useRef<Marker | null>(null);
  const prevView = useRef<{ center: maplibregl.LngLat; zoom: number } | null>(null); // where the map was before the GPS button zoomed in
  const zoomedRef = useRef(false);
  const [zoomedToMe, setZoomedToMe] = useState(false);
  const zoomIn = (map: MLMap, at: [number, number], zoom: number) => map.flyTo({ center: at, zoom, offset: offset(), duration: 1200 }); // the glide, as in Google Maps
  useEffect(() => {
    const map = mapRef.current;
    meMarker.current?.remove(); meMarker.current = null;
    if (!map || !ready || !me) return;
    // "Near me" from far away (planning a trip from home): the list sorts by distance, but the map stays on the region.
    if (me.far && me.intent === "near") return;
    const at = lngLat(me);
    const b = stateBounds.current;
    if (b && !b.contains(at) && !freeRef.current) {
      const wider = new maplibregl.LngLatBounds(b.getSouthWest(), b.getNorthEast()).extend(at);
      stateBounds.current = wider;
      limitTo(map, wider);
      fitMinZoom(map);
    }
    meMarker.current = new maplibregl.Marker({ element: el("div", { className: "me-dot" }) }).setLngLat(at).addTo(map);
    const chosen = selectedRef.current ? byIdRef.current.get(selectedRef.current) : null;
    if (me.intent === "fit" && chosen) { // a place is open: show you and the place together, so the distance can be seen
      map.fitBounds(new maplibregl.LngLatBounds(at, at).extend(lngLat(chosen)), { padding: fitPadding(24), maxZoom: 16, duration: 600, bearing: map.getBearing() });
      return;
    }
    if (me.intent === "quiet") return; // only the blue dot: the map stays where it is
    if (me.intent === "near") return void zoomIn(map, at, 13);
    // The GPS button: glide in to you at a modest zoom. The next tap on the button glides back out (see toggleLocate).
    zoomIn(map, at, Math.max(map.getZoom(), 15));
    if (me.intent === "map") { zoomedRef.current = true; setZoomedToMe(true); }
  }, [me, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the GPS could not be read, forget the view that was saved for the way back
  useEffect(() => { if (!locating && !zoomedRef.current) prevView.current = null; }, [locating]);

  // The GPS button, like Google Maps: first tap zooms in on you, the next tap zooms back out to where you were.
  // If you have moved the map away from yourself while zoomed in, the tap brings you back to the blue dot instead.
  const toggleLocate = () => {
    const map = mapRef.current;
    if (!map) return;
    if (zoomedRef.current && me) {
      const c = map.getContainer(), [, oy] = offset();
      const p = map.project(lngLat(me));
      const away = Math.hypot(p.x - c.clientWidth / 2, p.y - (c.clientHeight / 2 + oy));
      if (away > 90) return void zoomIn(map, lngLat(me), map.getZoom());
      const back = prevView.current;
      zoomedRef.current = false; setZoomedToMe(false); prevView.current = null;
      if (back) map.flyTo({ center: back.center, zoom: back.zoom, duration: 1200 });
      return;
    }
    prevView.current = { center: map.getCenter(), zoom: map.getZoom() };
    if (me?.at && Date.now() - me.at < 30000) { // a recent reading: no need to ask the GPS again
      zoomedRef.current = true; setZoomedToMe(true);
      zoomIn(map, lngLat(me), Math.max(map.getZoom(), 15));
    } else onLocate?.();
  };

  // From you to the open place: the road route (like Google Maps), labelled with the road distance and driving time.
  // Until the route arrives, or when there is none (offline), a dashed straight line labelled with the straight-line distance.
  const selPlace = selectedId ? byId.get(selectedId) : undefined;
  const meShown = !!me && !(me.far && me.intent === "near");
  const { route: meRoute } = useRoadRoute(meShown && me && selPlace ? [{ lat: me.lat, lng: me.lng }, { lat: selPlace.lat, lng: selPlace.lng }] : null);
  const meLabel = useRef<Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    meLabel.current?.remove(); meLabel.current = null;
    if (!map || !ready) return;
    if (!me || !meShown || !selPlace) { if (map.getSource("me-line")) putSource(map, "me-line", { type: "FeatureCollection", features: [] }); return; }
    const road = !!meRoute && meRoute.line.length > 1;
    const coords: [number, number][] = road ? meRoute!.line.map(([lat, lng]) => [lng, lat] as [number, number]) : [lngLat(me), lngLat(selPlace)];
    putSource(map, "me-line", { type: "Feature", properties: { kind: road ? "road" : "straight" }, geometry: { type: "LineString", coordinates: coords } });
    const over = firstSymbol(map);
    putLayer(map, { id: "me-road", type: "line", source: "me-line", filter: ["==", ["get", "kind"], "road"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#1a73e8", "line-width": 5, "line-opacity": 0.85 } }, over);
    putLayer(map, { id: "me-straight", type: "line", source: "me-line", filter: ["==", ["get", "kind"], "straight"], paint: { "line-color": token("--text"), "line-width": 2, "line-dasharray": [3, 3] } }, over);
    const at: [number, number] = road ? coords[Math.floor(coords.length / 2)] : [(coords[0][0] + coords[1][0]) / 2, (coords[0][1] + coords[1][1]) / 2];
    const text = road ? `${formatDistance(meRoute!.km)} · ${formatMinutes(meRoute!.minutes)}` : `${formatDistance(distanceKm(me, selPlace))} straight`;
    meLabel.current = new maplibregl.Marker({ element: el("span", { className: "dist-label" }, text) }).setLngLat(at).addTo(map);
  }, [me, meShown, selPlace?.id, selPlace?.lat, selPlace?.lng, ready, meRoute]); // eslint-disable-line react-hooks/exhaustive-deps

  // The open place's own pin (see selectedEl). It is rebuilt only when what it shows changes, so a data refresh doesn't replay the drop.
  const selMarker = useRef<{ key: string; marker: Marker } | null>(null);
  const selCat = selPlace ? categories[selPlace.category] ?? fallbackCategory() : null;
  const selKey = selPlace && selCat ? [selPlace.id, selPlace.lat, selPlace.lng, selPlace.name, selCat.icon, selCat.color, closedIds?.has(selPlace.id) ? 1 : 0, ready].join("|") : "";
  useEffect(() => {
    const map = mapRef.current;
    if (selMarker.current?.key === selKey) return;
    selMarker.current?.marker.remove();
    selMarker.current = null;
    if (!map || !ready || !selPlace || !selCat) return;
    const id = selPlace.id;
    const node = selectedEl(selCat.icon, selCat.color, selPlace.name, !!closedIds?.has(id));
    node.title = selPlace.name;
    node.addEventListener("click", e => { e.stopPropagation(); onSelectRef.current(id); });
    const marker = new maplibregl.Marker({ element: node, anchor: "bottom", offset: [0, SEL_H - SEL_TIP] }).setLngLat(lngLat(selPlace)).addTo(map);
    selMarker.current = { key: selKey, marker };
  }, [selKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { selMarker.current?.marker.remove(); selMarker.current = null; }, []);

  // Selecting a place flies to it, placing the pin in the part of the map the panels don't cover
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selPlace) return;
    map.flyTo({ center: lngLat(selPlace), zoom: Math.max(map.getZoom(), 14), offset: offset(), duration: 600 });
  }, [selectedId, focusTick, !!selPlace, ready]); // eslint-disable-line react-hooks/exhaustive-deps -- a place opened from a link: fly once its pin and the map exist

  // When a place is opened from an address, the list sheet rises a moment after the map has already flown to the pin, so the pin can end up
  // under the sheet. Once everything has settled, nudge the map (without animation: nothing else is moving) if the pin is not in view.
  useEffect(() => {
    if (!selectedId) return;
    const timer = window.setTimeout(() => {
      const map = mapRef.current, p = byIdRef.current.get(selectedId);
      if (!map || !p) return;
      const { top, bottom } = insetsRef.current, c = map.getContainer();
      const at = map.project(lngLat(p));
      if (at.y > top + 24 && at.y < c.clientHeight - bottom - 24 && at.x > 0 && at.x < c.clientWidth) return; // already in the visible part
      map.easeTo({ center: lngLat(p), offset: offset(), duration: 0 });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [selectedId, insets.top, insets.bottom]);

  // "My trip": the road route through the stops in visiting order (a dashed straight line until it arrives, or when offline)
  const { route: tripRoad } = useRoadRoute(route && route.length > 1 && route.length <= 25 ? route : null);
  const routeKey = route?.map(r => `${r.lat},${r.lng}`).join("|") ?? "";
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (!route || route.length < 2) { if (map.getSource("trip-line")) putSource(map, "trip-line", { type: "FeatureCollection", features: [] }); return; }
    const road = !!tripRoad && tripRoad.line.length > 1;
    const coords: [number, number][] = road ? tripRoad!.line.map(([lat, lng]) => [lng, lat] as [number, number]) : route.map(lngLat);
    putSource(map, "trip-line", { type: "Feature", properties: { kind: road ? "road" : "straight" }, geometry: { type: "LineString", coordinates: coords } });
    const over = firstSymbol(map);
    putLayer(map, { id: "trip-road", type: "line", source: "trip-line", filter: ["==", ["get", "kind"], "road"], layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": token("--accent"), "line-width": 5, "line-opacity": 0.85 } }, over);
    putLayer(map, { id: "trip-straight", type: "line", source: "trip-line", filter: ["==", ["get", "kind"], "straight"], layout: { "line-cap": "round" }, paint: { "line-color": token("--accent"), "line-width": 4, "line-opacity": 0.85, "line-dasharray": [0.5, 2] } }, over);
  }, [routeKey, ready, tripRoad]); // eslint-disable-line react-hooks/exhaustive-deps

  // The layers menu closes when you tap the map or press Escape, and never grows taller than the part of the map left free
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const away = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [menu]);
  const [menuMax, setMenuMax] = useState(260);
  useEffect(() => {
    if (!menu) return;
    const h = host.current?.clientHeight ?? 0;
    setMenuMax(Math.max(120, h - insets.top - insets.bottom - 80));
  }, [menu, insets.top, insets.bottom]);

  // Saves the map pieces of the view as it is now (and a little closer in) for offline use. A few dozen, like panning around would load.
  const [saving, setSaving] = useState(false);
  const saveView = async () => {
    const map = mapRef.current;
    if (!map || shown !== "detailed" || saving) return;
    if (!navigator.onLine) return void notify("You're offline. Open this area while connected to save it.", "error");
    const src = map.getSource("openmaptiles") as VectorTileSource | undefined;
    const template = src?.tiles?.[0], maxZ = src?.maxzoom ?? 14;
    if (!template) return void notify("Couldn't save the map. Try again in a moment.", "error");
    const b = map.getBounds(), z0 = Math.min(Math.floor(map.getZoom()), maxZ);
    const urls: string[] = [];
    for (const z of [z0, z0 + 1, z0 + 2]) {
      if (z > maxZ) break;
      const x0 = lon2tile(b.getWest(), z), x1 = lon2tile(b.getEast(), z), y0 = lat2tile(b.getNorth(), z), y1 = lat2tile(b.getSouth(), z);
      if (urls.length && urls.length + (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_OFFLINE_TILES) break;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) urls.push(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
    }
    if (urls.length > MAX_OFFLINE_TILES) return void notify("Zoom in a little first: this view is too wide to save.", "error");
    setSaving(true);
    let saved = 0;
    const queue = [...urls];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        try { const r = await fetch(u, { mode: "cors", credentials: "omit" }); if (r.ok) saved++; } catch { /* a piece that fails is just not saved */ }
      }
    }));
    setSaving(false);
    void notify(saved ? `Saved ${saved} map pieces for offline use on this device.` : "Couldn't save the map. Check your connection.", saved ? "info" : "error");
  };

  const choose = (s: MapStyle) => { setFallback(false); setStyle(s); store.set("map-style", s); };
  const turned = Math.round(bearing) % 360 !== 0;

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
      {/* The compass, as in Google Maps: it shows once the map is turned, points north, and a tap turns the map back */}
      {turned && (
        <div className={"map-compass" + (onLocate ? "" : " solo")}>
          <button type="button" className="map-layers" aria-label="Turn the map back to north" title="Reset to north" onClick={() => mapRef.current?.resetNorth({ duration: 350 })}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${-bearing}deg)` }}>
              <path d="M12 2.5 16 12h-8z" fill="#e53935" /><path d="M12 21.5 8 12h8z" fill="currentColor" opacity=".55" />
            </svg>
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
            {fallback && <p className="mm-note">The street map couldn't load, so the simple map is shown.</p>}
            <p className="mm-h">Show</p>
            <button type="button" className="chip" aria-pressed={showDistricts} onClick={() => { setShowDistricts(v => !v); store.set("map-districts", showDistricts ? "off" : "on"); }}>
              {showDistricts && <Icon name="check" size={16} />} District borders
            </button>
            <p className="mm-h">Offline</p>
            <button type="button" className="chip" disabled={saving || shown !== "detailed"} onClick={() => void saveView()} title={shown === "detailed" ? "Keeps the map you see now, and a little closer in, on this device" : "Switch to Streets to save the map"}>
              <Icon name="offline" size={16} /> {saving ? "Saving…" : "Save this view"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
