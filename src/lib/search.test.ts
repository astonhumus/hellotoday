import { describe, expect, it } from "vitest";
import { editDistance, normalize, searchPlaces, soundKey, type SearchFields } from "./search";

const P: SearchFields[] = [
  { name: "Loktak Lake", category: "Tourist Sites", district: "Bishnupur", desc: "Largest freshwater lake in the northeast" },
  { name: "Khongjom War Memorial", category: "Tourist Sites", district: "Thoubal" },
  { name: "Kangla Fort", category: "Tourist Sites", district: "Imphal West" },
  { name: "Ima Keithel", category: "Snacks", district: "Imphal West", desc: "Women market" },
  { name: "Hotel Imphal", category: "Hotels", district: "Imphal East" }
];
const names = (q: string) => (searchPlaces(P, q, p => p)?.hits ?? []).map(r => r.item.name);

describe("search", () => {
  it("normalises accents, case and punctuation", () => expect(normalize("  Café, Lake! ")).toBe("cafe lake"));
  it("counts typos", () => { expect(editDistance("loktak", "loktek", 2)).toBe(1); expect(editDistance("ab", "ba", 2)).toBe(1); });
  it("returns null for an empty query", () => expect(searchPlaces(P, "  ", p => p)).toBeNull());
  it("matches a partial word", () => expect(names("lok")[0]).toBe("Loktak Lake"));
  it("tolerates a typo", () => { expect(names("loktek")[0]).toBe("Loktak Lake"); expect(names("imphl")).toContain("Hotel Imphal"); });
  it("ignores spacing", () => expect(names("khong jom")[0]).toBe("Khongjom War Memorial"));
  it("finds by category and district", () => { expect(names("snacks")).toEqual(["Ima Keithel"]); expect(names("thoubal")).toEqual(["Khongjom War Memorial"]); });
  it("finds by description", () => expect(names("freshwater")).toEqual(["Loktak Lake"]));
  it("ranks name matches above district matches", () => expect(names("imphal")[0]).toBe("Hotel Imphal"));
  it("falls back to partial matches when not every word matches", () => expect(names("loktak fort")).toEqual(expect.arrayContaining(["Loktak Lake", "Kangla Fort"])));
  it("forgives typos in names only, not districts", () => {
    expect(names("imphl")).toEqual(["Hotel Imphal"]); // not every place in the Imphal districts
    expect(names("bishnpur")).toEqual([]);
  });
  it("puts names that start with the text first", () => expect(names("imphal")[0]).toBe("Hotel Imphal"));
  it("finds alternative spellings by sound, as a last resort", () => {
    expect(soundKey("lairembi")).toBe(soundKey("lairenbi"));
    expect(names("kongjam")).toEqual(["Khongjom War Memorial"]);
    expect(names("meetei")).toEqual([]); // no such name here: sound matching does not invent results
  });
  it("keeps only the most probable sound-alikes", () => {
    const set = [{ name: "Khongjom One" }, { name: "Khongjom Two" }, { name: "Khongjam Three Annex Block" }, { name: "Khungsam" }];
    const r = searchPlaces(set, "kungjam", p => p)!.hits.map(x => x.item.name);
    expect(r).toEqual(expect.arrayContaining(["Khongjom One", "Khongjom Two", "Khongjam Three Annex Block"]));
    expect(r).not.toContain("Khungsam");
  });
  it("never returns more than 8, and reports how many matched", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: `Imphal Place ${i}` }));
    const r = searchPlaces(many, "imphal", p => p)!;
    expect(r.hits).toHaveLength(8);
    expect(r.total).toBe(40);
  });
  it("shows nothing for unrelated text", () => expect(names("zzzxq")).toEqual([]));
});
