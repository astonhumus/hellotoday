import { describe, expect, it } from "vitest";
import { distanceKm, formatKm } from "./geo";

describe("distanceKm", () => {
  it("is zero for the same point", () => expect(distanceKm({ lat: 24.8, lng: 93.9 }, { lat: 24.8, lng: 93.9 })).toBe(0));
  it("measures Imphal to Guwahati at about 400 km", () => {
    const d = distanceKm({ lat: 24.817, lng: 93.936 }, { lat: 26.144, lng: 91.736 });
    expect(d).toBeGreaterThan(260); expect(d).toBeLessThan(300);
  });
  it("measures one degree of latitude at about 111 km", () => expect(distanceKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 0));
});

describe("formatKm", () => {
  it("uses metres under a kilometre", () => expect(formatKm(0.25)).toBe("250 m"));
  it("rolls 995 m up to km", () => expect(formatKm(0.996)).toBe("1.0 km"));
  it("keeps one decimal under 10 km", () => expect(formatKm(3.44)).toBe("3.4 km"));
  it("rounds above 10 km", () => expect(formatKm(127.3)).toBe("127 km"));
});
