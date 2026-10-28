import { describe, expect, it } from "vitest";
import { formatCoords, parseCoords } from "./coords";

describe("parseCoords", () => {
  it("reads plain latitude, longitude", () => {
    expect(parseCoords("24.8089, 93.9426")).toEqual({ lat: 24.8089, lng: 93.9426 });
    expect(parseCoords("(24.8089 93.9426)")).toEqual({ lat: 24.8089, lng: 93.9426 });
  });
  it("reads degrees, minutes, seconds", () => {
    const p = parseCoords(`24°48'32.0"N 93°56'33.4"E`)!;
    expect(p.lat).toBeCloseTo(24.80889, 4);
    expect(p.lng).toBeCloseTo(93.94261, 4);
  });
  it("reads Google Maps links", () => {
    expect(parseCoords("https://www.google.com/maps/@24.8,93.9,15z")).toEqual({ lat: 24.8, lng: 93.9 });
    expect(parseCoords("https://maps.google.com/?q=24.8,93.9")).toEqual({ lat: 24.8, lng: 93.9 });
  });
  it("rejects nonsense and out-of-range values", () => {
    expect(parseCoords("")).toBeNull();
    expect(parseCoords("hello")).toBeNull();
    expect(parseCoords("124.8, 93.9")).toBeNull();
  });
  it("formats to five decimals", () => {
    expect(formatCoords(24.80891, 93.94261)).toBe("24.80891, 93.94261");
  });
});
