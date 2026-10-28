import { useCallback, useState } from "react";
import { store } from "../lib/data";

const KEY = "filter-multi";

/**
 * Selection for a row of filter chips. By default it is single-select: tapping a chip picks only that one, and
 * tapping it again goes back to "all". Switching on "Select several" lets people combine chips.
 * The choice is remembered on the device and shared by every filter in the app.
 */
export function useChipFilter() {
  const [multi, setMultiState] = useState(() => store.get(KEY) === "1");
  const [picked, setPicked] = useState<Set<string>>(new Set()); // empty = everything

  const setMulti = useCallback((on: boolean) => {
    setMultiState(on);
    store.set(KEY, on ? "1" : "0");
    if (!on) setPicked(p => (p.size > 1 ? new Set([[...p][0]]) : p)); // single mode keeps just one
  }, []);

  const toggle = useCallback((id: string) => setPicked(prev => {
    if (multi) {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    }
    return prev.size === 1 && prev.has(id) ? new Set() : new Set([id]);
  }), [multi]);

  const clear = useCallback(() => setPicked(new Set()), []);

  return { multi, setMulti, picked, toggle, clear };
}
