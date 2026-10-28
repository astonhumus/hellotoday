import { describe, expect, it } from "vitest";
import { explainError } from "./ui";

describe("explainError", () => {
  it("explains permission, session and size problems in plain words", () => {
    expect(explainError("new row violates row-level security policy")).toMatch(/permission/i);
    expect(explainError("JWT expired")).toMatch(/session/i);
    expect(explainError('violates check constraint "songs_limits"')).toMatch(/too long/i);
    expect(explainError("TypeError: Failed to fetch")).toMatch(/offline/i);
  });
  it("passes unknown messages through", () => {
    expect(explainError("Something odd")).toBe("Something odd");
  });
});
