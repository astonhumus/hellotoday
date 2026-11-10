import { describe, expect, it } from "vitest";
import { fetchAll, safeDecode } from "./fetchAll";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i);
const source = (total: number) => async (from: number, to: number) => ({ data: rows(total).slice(from, to + 1), error: null });

describe("fetchAll", () => {
  it("reads past the 1000-row server cap", async () => {
    expect((await fetchAll(source(2500))).data).toHaveLength(2500);
    expect((await fetchAll(source(1000))).data).toHaveLength(1000);
    expect((await fetchAll(source(0))).data).toHaveLength(0);
  });
  it("reports an error and keeps what it already had", async () => {
    const r = await fetchAll<number>(async from => from === 0 ? { data: rows(1000), error: null } : { data: null, error: { message: "boom" } });
    expect(r.error?.message).toBe("boom");
    expect(r.data).toHaveLength(1000);
  });
});

describe("safeDecode", () => {
  it("decodes normal text and survives malformed escapes", () => {
    expect(safeDecode("a%20b")).toBe("a b");
    expect(safeDecode("%E0%A4%A")).toBe("%E0%A4%A");
  });
});
