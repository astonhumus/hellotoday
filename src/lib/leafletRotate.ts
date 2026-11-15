// Map rotation, as in Google Maps: twist with two fingers, or Shift + mouse wheel on a computer.
// leaflet-rotate patches Leaflet in place and reads the global `L` that Leaflet sets when it loads, so it must be imported after "leaflet".
import L from "leaflet";
import "leaflet-rotate";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    rotateControl?: boolean | object;
  }
  interface Map {
    setBearing(deg: number): this;
    getBearing(): number;
  }
  interface Point {
    rotate(theta: number): Point; // radians
  }
}

export default L;
