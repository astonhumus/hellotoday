import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MLMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { LatLng } from "../../lib/coords";
import { iconSvg } from "../../ui/icons";
import { useTheme } from "../../lib/theme";
import { circle, putLayer, putSource, simpleStyle, streetStyle } from "../../lib/mapStyle";

interface Props {
  point: LatLng | null;
  accuracy?: number | null;           // metres, from the GPS reading
  onMove: (p: LatLng) => void;        // the pin was dragged or the map tapped
  center?: [number, number];          // where to start looking (the chosen region), [lat, lng]
  zoom?: number;
}

/** Small map showing the chosen point. Drag the pin or tap the map to fine-tune it. */
export function LocationPicker({ point, accuracy, onMove, center = [24.75, 93.9], zoom = 9 }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const pin = useRef<Marker | null>(null);
  const move = useRef(onMove);
  move.current = onMove;
  const fromMap = useRef(false); // the last change came from this map, so don't re-centre under the person's finger
  const theme = useTheme();
  const [loaded, setLoaded] = useState(0);
  const [simple, setSimple] = useState(false); // no street map (offline): a plain background, the pin still works

  // Typed coordinates change on every keystroke: wait for a pause before moving the map.
  const [shown, setShown] = useState(point);
  useEffect(() => {
    if (!point || fromMap.current || !shown) { setShown(point); return; }
    const t = window.setTimeout(() => setShown(point), 400);
    return () => window.clearTimeout(t);
  }, [point?.lat, point?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!el.current) return;
    const start = shown ?? null;
    const m = new maplibregl.Map({
      container: el.current, style: simple ? simpleStyle() : streetStyle(theme),
      center: start ? [start.lng, start.lat] : [center[1], center[0]], zoom: start ? 16 : Math.min(zoom, 12),
      maxPitch: 0, pitchWithRotate: false, touchPitch: false, attributionControl: { compact: true }
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), "top-left");
    m.on("click", e => { fromMap.current = true; move.current({ lat: e.lngLat.lat, lng: e.lngLat.lng }); });
    let ok = false;
    m.on("load", () => { ok = true; setLoaded(n => n + 1); });
    m.on("error", () => { if (!ok && !simple) setSimple(true); });
    map.current = m;
    return () => { m.remove(); map.current = null; pin.current = null; };
  }, [theme, simple]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    if (!m || !loaded || !shown) return;
    const ll: [number, number] = [shown.lng, shown.lat];
    if (!pin.current) {
      const node = document.createElement("div");
      node.className = "pin-wrap";
      node.style.width = node.style.height = "48px";
      node.innerHTML = `<span class="pin selected">${iconSvg("pin", 20)}</span>`; // the app's own icon markup
      pin.current = new maplibregl.Marker({ element: node, draggable: true }).setLngLat(ll).addTo(m);
      pin.current.on("dragend", () => { const p = pin.current!.getLngLat(); fromMap.current = true; move.current({ lat: p.lat, lng: p.lng }); });
    } else pin.current.setLngLat(ll);
    // The GPS accuracy ring
    putSource(m, "acc", accuracy && accuracy > 0 ? circle(shown.lat, shown.lng, accuracy) : { type: "FeatureCollection", features: [] });
    putLayer(m, { id: "acc-fill", type: "fill", source: "acc", paint: { "fill-color": "#1a73e8", "fill-opacity": 0.12 } });
    putLayer(m, { id: "acc-line", type: "line", source: "acc", paint: { "line-color": "#1a73e8", "line-opacity": 0.6, "line-width": 1 } });
    if (fromMap.current) { // the person moved the pin themselves: keep the view still unless the pin left it
      fromMap.current = false;
      if (!m.getBounds().contains(ll)) m.panTo(ll);
    } else m.jumpTo({ center: ll, zoom: Math.max(m.getZoom(), 16) });
  }, [shown?.lat, shown?.lng, accuracy, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="loc-map" role="application" aria-label="Map showing the chosen location. Tap the map or drag the pin to adjust." />;
}
