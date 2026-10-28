import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { cacheGet, cacheSet } from "./cache";
import { explainError, notify } from "./ui";

type Row = Record<string, unknown>;

interface Spec<T> {
  table: string;
  kind: "place" | "song";
  columns: string;                           // explicit list: the public may not read every column (see supabase/hardening.sql)
  propose?: boolean;                         // contributor without auto-approve: edits to live items become proposals
  scope?: { column: string; value: string }; // e.g. only the current state's places
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
  const cacheKey = `rows:${table}:${scopeVal ?? ""}`;

  const load = async () => {
    if (!supabase || !spec) return;
    setLoading(true);
    let q = supabase.from(spec.table).select(spec.columns).limit(5000);
    if (spec.scope) q = q.eq(spec.scope.column, spec.scope.value);
    const { data, error } = await q;
    setLoading(false);
    if (error) { console.warn(`Could not load ${spec.table}:`, error.message); return; } // keep whatever is showing (cached copy)
    const mapped = (data as unknown as Row[]).map(spec.fromRow);
    setRows(mapped);
    // Offline copy = the public view (approved items only), whoever is signed in.
    void cacheSet(cacheKey, mapped.filter(x => !x.status || x.status === "approved"));
  };

  useEffect(() => {
    let live = true;
    setRows(null);
    // Show the saved copy straight away (instant start, works offline), then refresh from the network.
    if (spec) void cacheGet<T[]>(cacheKey).then(c => { if (live && c) setRows(cur => cur ?? c); });
    void load();
    return () => { live = false; };
  }, [table, scopeCol, scopeVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = rows ?? fallback;
  const scoped = (r: Row): Row => (spec?.scope ? { ...r, [spec.scope.column]: spec.scope.value } : r);

  const save = async (item: Omit<T, "id">, id?: string) => {
    if (!supabase || !spec) return;
    const existing = id ? items.find(x => x.id === id) : undefined;
    // Editing something already live as a contributor who isn't trusted: send it to the admin instead.
    if (id && spec.propose && existing?.status === "approved") {
      const { error } = await supabase.rpc("propose_revision", {
        p_kind: spec.kind, p_target: id, p_data: spec.toRow(item, id), p_base: existing.updatedAt ?? null
      });
      return error ? void fail(error.message) : void notify("Thanks! Your change was sent to the admin for approval.");
    }
    const newId = id ?? "u-" + Date.now().toString(36);
    const next = { ...item, id: newId } as T;
    setRows(cur => { const base = cur ?? fallback; return base.some(x => x.id === newId) ? base.map(x => (x.id === newId ? next : x)) : [...base, next]; });
    const { error } = await supabase.from(spec.table).upsert(scoped(spec.toRow(item, newId)));
    if (error) void fail(error.message);
    void load();
  };

  const remove = async (id: string) => {
    if (!supabase || !spec) return;
    setRows(cur => (cur ?? fallback).filter(x => x.id !== id));
    const { error } = await supabase.from(spec.table).delete().eq("id", id);
    if (error) void fail(error.message);
    void load();
  };

  /** Resolves true when every item was stored. */
  const addMany = async (more: T[]) => {
    if (!supabase || !spec || !more.length) return true;
    const { error } = await supabase.from(spec.table).upsert(more.map(({ id, ...rest }) => scoped(spec.toRow(rest, id))));
    if (error) void fail(error.message);
    void load();
    return !error;
  };

  return { items, loading, reload: load, localIds: useMemo(() => new Set<string>(), []), save, remove, addMany };
}
