import { describe, expect, it } from "vitest";
import { formatDate, kindName, kindPlural, plural, safeHttps } from "./format";

describe("plural", () => {
  it("uses the singular for one", () => expect(plural(1, "place")).toBe("1 place"));
  it("adds s otherwise", () => { expect(plural(0, "place")).toBe("0 places"); expect(plural(5, "place")).toBe("5 places"); });
  it("takes a custom plural", () => expect(plural(2, "category", "categories")).toBe("2 categories"));
});

describe("kindName / kindPlural", () => {
  it("keeps the first of two names", () => expect(kindName("District|Regencies")).toBe("District"));
  it("pluralises like English", () => {
    expect(kindPlural("State")).toBe("States");
    expect(kindPlural("County")).toBe("Counties");
    expect(kindPlural("Parish")).toBe("Parishes");
    expect(kindPlural("Municipality|Governarate")).toBe("Municipalities");
  });
  it("falls back to State", () => expect(kindName(undefined)).toBe("State"));
});

describe("formatDate", () => {
  it("leaves non-dates alone", () => expect(formatDate("soon")).toBe("soon"));
  it("formats a date with its year and day", () => { const s = formatDate("2026-11-12"); expect(s).toContain("2026"); expect(s).toContain("12"); });
});

describe("safeHttps", () => {
  it("accepts https only", () => {
    expect(safeHttps("https://a.b/c.jpg")).toBe("https://a.b/c.jpg");
    expect(safeHttps("http://a.b")).toBe("");
    expect(safeHttps("javascript:alert(1)")).toBe("");
  });
});
