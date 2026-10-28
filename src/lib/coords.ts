export interface LatLng { lat: number; lng: number }

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const dms = (d: string, m: string, s: string, hemi: string) => {
  const v = +d + +m / 60 + +s / 3600;
  return /[SW]/i.test(hemi) ? -v : v;
};

/**
 * Reads coordinates pasted from Google Maps. Accepts:
 *   24.8089, 93.9426                         (right-click > copy coordinates)
 *   24°48'32.0"N 93°56'33.4"E                (degrees/minutes/seconds)
 *   https://www.google.com/maps/@24.8,93.9,15z, .../place/...!3d24.8!4d93.9, ...?q=24.8,93.9
 */
export function parseCoords(input: string): LatLng | null {
  const s = input.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  let lat: number, lng: number;

  if ((m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)) ||
      (m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)) ||
      (m = s.match(/[?&](?:q|query|ll|destination|daddr)=(-?\d+(?:\.\d+)?)(?:,|%2C)\s*(-?\d+(?:\.\d+)?)/i))) {
    lat = +m[1]; lng = +m[2];
  } else if ((m = s.match(/(\d+)\D+(\d+)\D+(\d+(?:\.\d+)?)\D*([NS])\s*,?\s*(\d+)\D+(\d+)\D+(\d+(?:\.\d+)?)\D*([EW])/i))) {
    lat = dms(m[1], m[2], m[3], m[4]); lng = dms(m[5], m[6], m[7], m[8]);
  } else if ((m = s.match(/^\(?\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*\)?$/))) {
    lat = +m[1]; lng = +m[2];
  } else {
    return null;
  }
  return valid(lat, lng) ? { lat, lng } : null;
}

export const formatCoords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
