export interface Point { lat: number; lng: number }

/** Straight-line distance in km between two points (great circle). */
export function distanceKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** "850 m", "3.4 km", "127 km". */
export function formatKm(km: number): string {
  if (km < 0.995) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/**
 * A sensible visiting order: always go to the nearest stop not yet visited. Starts from `start` when given,
 * otherwise from the first stop. Good enough for a day's plan; it does not try every combination.
 */
export function routeOrder<T extends Point>(stops: T[], start?: Point | null): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at: Point | null = start ?? null;
  if (!at && left.length) { const first = left.shift()!; out.push(first); at = first; }
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceKm(at!, left[i]) < distanceKm(at!, left[best])) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    at = next;
  }
  return out;
}

/** Total straight-line length of a path through the points, in km. */
export function pathKm(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceKm(points[i - 1], points[i]);
  return total;
}
