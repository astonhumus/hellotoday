import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import { cacheGet, cacheSet } from "./cache";
import { explainError, notify } from "./ui";
import { fetchAll } from "./fetchAll";

type Row = Record<string, unknown>;

interface Spec<T> {
  table: string;
  kind: "place" | "song" | "category";
  columns: string;
  fallbackColumns?: string | string[];       // tried in turn when the database does not have the newest columns yet (a migration not run)
  propose?: boolean;                         // contributor without auto-approve: edits to live items become proposals
  scope?: { column: string; value: string }; // e.g. only the current state's places (leave out to load every region)
  fixed?: { column: string; value: string };  // always written with saved rows, even when the load is not scoped
  toRow: (item: Omit<T, "id">, id: string) => Row;
  fromRow: (row: Row) => T;
}

const fail = (msg: string) => notify(`Couldn't save: ${explainError(msg)}`, "error");

/**
 * Items stored as real rows in a Supabase table. `fallback` (the bundled JSON) is shown while loading
 * and when the database can't be reached, e.g. offline. Pass spec = null to stay inert.
 */
export function useRows<T extends { id: string; status?: string; updatedAt?: string }>(spec: Spec<T> | null, fallback: T[]) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(false);
  const table = spec?.table, scopeCol = spec?.scope?.column, scopeVal = spec?.scope?.value;
  const cacheKey = `rows:${table}:${scopeVal ?? "*"}`;
  const lastSig = useRef("");
  const loadSeq = useRef(0);
  const soon = useRef<number | undefined>(undefined);

  const load = async () => {
    if (!supabase || !spec) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    // Paged: the server hands out at most 1000 rows per request, so a bigger table would be silently cut off.
    const read = (columns: string) => fetchAll<Row>((from, to) => {
      let q = supabase!.from(spec.table).select(columns).order("id").range(from, to);
      if (spec.scope) q = q.eq(spec.scope.column, spec.scope.value);
      return q as unknown as PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
    });
    let { data, error } = await read(spec.columns);
    for (const cols of [spec.fallbackColumns ?? []].flat()) {
      if (!error || !/column|schema/i.test(error.message)) break;
      ({ data, error } = await read(cols));
    }
    if (seq !== loadSeq.current) return; // a newer load is under way: don't let this older answer overwrite it
    setLoading(false);
    if (error) { console.warn(`Could not load ${spec.table}:`, error.message); return; } // keep whatever is showing (cached copy)
    const mapped = data.map(spec.fromRow);
    // Keep the same array when nothing changed, so the map and the list don't redraw after a background refresh.
    const sig = JSON.stringify(mapped);
    if (sig !== lastSig.current) { lastSig.current = sig; setRows(mapped); }
    // Offline copy = the public view (approved items only), whoever is signed in.
    void cacheSet(cacheKey, mapped.filter(x => !x.status || x.status === "approved"));
  };

  useEffect(() => {
    let live = true;
    setRows(null);
    lastSig.current = "";
    // Show the saved copy straight away (instant start, works offline), then refresh from the network.
    if (spec) void cacheGet<T[]>(cacheKey).then(c => { if (live && c) setRows(cur => cur ?? c); });
    void load();
    return () => { live = false; };
  }, [table, scopeCol, scopeVal]); // eslint-disable-line react-hooks/exhaustive-deps

  // After a change, reload once things go quiet (a burst of saves, e.g. reordering categories, becomes one reload).
  const loadSoon = () => { window.clearTimeout(soon.current); soon.current = window.setTimeout(() => void load(), 300); };
  useEffect(() => () => window.clearTimeout(soon.current), []);

  const items = rows ?? fallback;
  const scoped = (r: Row): Row => { const w = spec?.fixed ?? spec?.scope; return w ? { ...r, [w.column]: w.value } : r; };

  const save = async (item: Omit<T, "id">, id?: string) => {
    if (!supabase || !spec) return;
    const existing = id ? items.find(x => x.id === id) : undefined;
    // Editing something already live as a contributor who isn't trusted: send it to the admin instead.
    if (id && spec.propose && existing?.status === "approved") {
      const { error } = await supabase.rpc("propose_revision", {
        p_kind: spec.kind, p_target: id, p_data: spec.toRow(item, id), p_base: existing.updatedAt ?? null
      });
      return error ? void fail(error.message) : void notify("Thanks! Your change was sent to the admin for approval. The live version stays as it is until then.");
    }
    const before = items;
    const newId = id ?? "u-" + Date.now().toString(36);
    const next = { ...item, id: newId } as T;
    setRows(cur => { const base = cur ?? fallback; return base.some(x => x.id === newId) ? base.map(x => (x.id === newId ? next : x)) : [...base, next]; });
    const { error } = await supabase.from(spec.table).upsert(scoped(spec.toRow(item, newId)));
    if (error) { void fail(error.message); setRows(before); } // put the screen back: the change was NOT stored (also when offline)
    else if (!id && spec.propose) void notify("Thanks! Your submission is waiting for admin approval. Only you can see it until then.");
    loadSoon();
  };

  const remove = async (id: string) => {
    if (!supabase || !spec) return;
    const before = items;
    setRows(cur => (cur ?? fallback).filter(x => x.id !== id));
    const { error } = await supabase.from(spec.table).delete().eq("id", id);
    if (error) { void fail(error.message); setRows(before); }
    loadSoon();
  };

  /** Resolves true when every item was stored. */
  const addMany = async (more: T[]) => {
    if (!supabase || !spec || !more.length) return true;
    // In chunks, so one huge import is not a single giant request.
    for (let i = 0; i < more.length; i += 200) {
      const { error } = await supabase.from(spec.table).upsert(more.slice(i, i + 200).map(({ id, ...rest }) => scoped(spec.toRow(rest, id))));
      if (error) { void fail(error.message); loadSoon(); return false; }
    }
    loadSoon();
    return true;
  };

  return { items, loading, reload: load, localIds: useMemo(() => new Set<string>(), []), save, remove, addMany };
}
