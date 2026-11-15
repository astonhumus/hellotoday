import { useEffect, useState } from "react";
import type { Point } from "./geo";

// Road distances and the road line itself come from the public OSRM server (OpenStreetMap road data, free for modest use).
// Set VITE_ROUTING_URL to your own OSRM server if traffic grows. Add its host to connect-src in public/_headers.
const OSRM = (import.meta.env.VITE_ROUTING_URL || "https://router.project-osrm.org").replace(/\/$/, "");

export interface RoadRoute {
  km: number;                 // along the roads
  minutes: number;            // driving time, without traffic
  line: [number, number][];   // [lat, lng] points to draw
}

const memo = new Map<string, Promise<RoadRoute | null>>();
const key = (pts: Point[]) => pts.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(";");

/** The driving route through the points, in order. Resolves null when there is no road route (offline, island, server down). */
export function roadRoute(points: Point[]): Promise<RoadRoute | null> {
  if (points.length < 2) return Promise.resolve(null);
  const k = key(points);
  const have = memo.get(k);
  if (have) return have;
  const coords = points.map(p => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const job = fetch(`${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`, { credentials: "omit" })
    .then(r => (r.ok ? r.json() : null))
    .then((j: any) => {
      const r = j?.code === "Ok" ? j.routes?.[0] : null;
      if (!r) return null;
      return { km: r.distance / 1000, minutes: r.duration / 60, line: (r.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => [lat, lng]) };
    })
    .catch(() => null);
  memo.set(k, job);
  void job.then(v => { if (!v) memo.delete(k); }); // a failure may be temporary: ask again next time
  if (memo.size > 60) memo.delete(memo.keys().next().value!);
  return job;
}

/** React hook: the road route through the points, or null while loading / when unavailable. */
export function useRoadRoute(points: Point[] | null): { route: RoadRoute | null; loading: boolean } {
  const k = points && points.length > 1 ? key(points) : "";
  const [state, setState] = useState<{ k: string; route: RoadRoute | null; loading: boolean }>({ k: "", route: null, loading: false });
  useEffect(() => {
    if (!k || !points) { setState({ k: "", route: null, loading: false }); return; }
    let live = true;
    setState({ k, route: null, loading: true });
    // Wait a moment: the GPS position and the open place can change in quick succession.
    const t = window.setTimeout(() => void roadRoute(points).then(route => { if (live) setState({ k, route, loading: false }); }), 250);
    return () => { live = false; window.clearTimeout(t); };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  return state.k === k ? { route: state.route, loading: state.loading } : { route: null, loading: !!k };
}

/** "25 min", "1 h 40 min". */
export function formatMinutes(min: number): string {
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
