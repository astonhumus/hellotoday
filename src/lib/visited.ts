import { useCallback, useEffect, useState } from "react";
import { store } from "./data";

const KEY = "my-visited"; // { [placeId]: "YYYY-MM-DD" }, kept on this device only

const read = (): Record<string, string> => {
  try { const v = JSON.parse(store.get(KEY) ?? "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
};
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** The places this person has marked "I've been here". Saved in this browser; no account needed. */
export function useVisited() {
  const [visited, setVisited] = useState<Record<string, string>>(read);

  // Stay in sync if another tab changes it.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setVisited(read()); };
    addEventListener("storage", on);
    return () => removeEventListener("storage", on);
  }, []);

  const toggle = useCallback((id: string) => {
    setVisited(cur => {
      const next = { ...cur };
      if (next[id]) delete next[id]; else next[id] = today();
      store.set(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { visited, has: (id: string) => id in visited, when: (id: string) => visited[id], count: Object.keys(visited).length, toggle };
}
