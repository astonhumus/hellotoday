import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "../../lib/coords";
import { iconSvg } from "../../ui/icons";

const TILES = import.meta.env.VITE_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// The app's own pin (not Leaflet's default image, which can fail to load in a bundled build).
const pinIcon = L.divIcon({ className: "pin-wrap", html: `<span class="pin selected">${iconSvg("pin", 20)}</span>`, iconSize: [38, 38], iconAnchor: [19, 19] });

interface Props {
  point: LatLng | null;
  accuracy?: number | null;           // metres, from the GPS reading
  onMove: (p: LatLng) => void;        // the pin was dragged or the map tapped
  center?: [number, number];          // where to start looking (the chosen region)
  zoom?: number;
}

/** Small map showing the chosen point. Drag the pin or tap the map to fine-tune it. */
export function LocationPicker({ point, accuracy, onMove, center = [24.75, 93.9], zoom = 9 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pin = useRef<L.Marker | null>(null);
  const ring = useRef<L.Circle | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const fromMap = useRef(false); // the last change came from this map, so don't re-centre under the person's finger

  // Typed coordinates change on every keystroke: wait for a pause before moving the map.
  const [shown, setShown] = useState(point);
  useEffect(() => {
    if (!point || fromMap.current || !shown) { setShown(point); return; }
    const t = window.setTimeout(() => setShown(point), 400);
    return () => window.clearTimeout(t);
  }, [point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(center, Math.min(zoom, 12));
    L.tileLayer(TILES, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    m.on("click", e => { fromMap.current = true; move.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    map.current = m;
    const t = window.setTimeout(() => m.invalidateSize(), 150); // the dialog was still opening
    return () => { window.clearTimeout(t); m.remove(); map.current = null; pin.current = null; ring.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !shown) return;
    const ll: L.LatLngExpression = [shown.lat, shown.lng];
    if (!pin.current) {
      pin.current = L.marker(ll, { icon: pinIcon, draggable: true, keyboard: false }).addTo(m);
      pin.current.on("dragend", () => { const p = pin.current!.getLatLng(); fromMap.current = true; move.current({ lat: p.lat, lng: p.lng }); });
    } else pin.current.setLatLng(ll);
    ring.current?.remove(); ring.current = null;
    if (accuracy && accuracy > 0) ring.current = L.circle(ll, { radius: accuracy, weight: 1, opacity: 0.6, fillOpacity: 0.12 }).addTo(m);
    if (fromMap.current) { // the person moved the pin themselves: keep the view still unless the pin left it
      fromMap.current = false;
      if (!m.getBounds().contains(ll)) m.panTo(ll);
    } else m.setView(ll, Math.max(m.getZoom(), 16), { animate: false });
  }, [shown?.lat, shown?.lng, accuracy]);

  return <div ref={el} className="loc-map" role="application" aria-label="Map showing the chosen location. Tap the map or drag the pin to adjust." />;
}
