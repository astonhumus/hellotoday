import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

type Row = Record<string, unknown>;

interface Spec<T> {
  table: string;
  kind: "place" | "song";
  propose?: boolean;                        // contributor without auto-approve: edits to live items become proposals
  scope?: { column: string; value: string }; // e.g. only the current state's places
  toRow: (item: Omit<T, "id">, id: string) => Row;
  fromRow: (row: Row) => T;
}

const fail = (msg: string) => alert(`Couldn't save: ${msg.includes("row-level") || msg.includes("permission") ? "sign in as admin first." : msg}`);

/**
 * Items stored as real rows in a Supabase table. `fallback` (the bundled JSON) is shown while loading
 * and when the database can't be reached, e.g. offline. Pass spec = null to stay inert.
 */
export function useRows<T extends { id: string; status?: string }>(spec: Spec<T> | null, fallback: T[]) {
  const [rows, setRows] = useState<T[] | null>(null);
  const table = spec?.table, scopeCol = spec?.scope?.column, scopeVal = spec?.scope?.value;

  const load = async () => {
    if (!supabase || !spec) return;
    let q = supabase.from(spec.table).select("*").limit(5000);
    if (spec.scope) q = q.eq(spec.scope.column, spec.scope.value);
    const { data, error } = await q;
    if (error) { console.warn(`Could not load ${spec.table}:`, error.message); return setRows(null); }
    setRows((data as Row[]).map(spec.fromRow));
  };

  useEffect(() => { setRows(null); void load(); }, [table, scopeCol, scopeVal]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = rows ?? fallback;
  const scoped = (r: Row): Row => (spec?.scope ? { ...r, [spec.scope.column]: spec.scope.value } : r);

  const save = async (item: Omit<T, "id">, id?: string) => {
    if (!supabase || !spec) return;
    if (id && spec.propose && items.find(x => x.id === id)?.status === "approved") {
      const { error } = await supabase.from("revisions").insert({ kind: spec.kind, target_id: id, data: spec.toRow(item, id) });
      return error ? fail(error.message) : alert("Thanks! Your change was sent to the admin for approval.");
    }
    const newId = id ?? "u-" + Date.now().toString(36);
    const next = { ...item, id: newId } as T;
    setRows(cur => { const base = cur ?? fallback; return base.some(x => x.id === newId) ? base.map(x => (x.id === newId ? next : x)) : [...base, next]; });
    const { error } = await supabase.from(spec.table).upsert(scoped(spec.toRow(item, newId)));
    if (error) fail(error.message);
    void load();
  };

  const remove = async (id: string) => {
    if (!supabase || !spec) return;
    setRows(cur => (cur ?? fallback).filter(x => x.id !== id));
    const { error } = await supabase.from(spec.table).delete().eq("id", id);
    if (error) { fail(error.message); void load(); }
  };

  const addMany = async (more: T[]) => {
    if (!supabase || !spec || !more.length) return;
    setRows(cur => [...(cur ?? fallback), ...more]);
    const { error } = await supabase.from(spec.table).upsert(more.map(({ id, ...rest }) => scoped(spec.toRow(rest, id))));
    if (error) { fail(error.message); void load(); }
  };

  return { items, reload: load, localIds: useMemo(() => new Set<string>(), []), save, remove, addMany };
}
