import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { store } from "./data";
import { supabase } from "./supabase";
import { cacheGet, cacheSet } from "./cache";
import { explainError, notify } from "./ui";

type Remote = { id: string; data: any; deleted: boolean };

const read = <T,>(key: string): T[] => {
  try { const v = JSON.parse(store.get(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};

const fail = (msg: string) => notify(`Couldn't save: ${explainError(msg)}`, "error");

/**
 * Lets the user add, edit and delete items that ship in the read-only JSON files. Additions and edited
 * copies (same id as the original) are kept in `local`; removed originals are remembered by id in `deleted`.
 * With Supabase configured they are stored in the shared `items` table (see supabase/schema.sql), otherwise
 * in this browser's localStorage. `key` names the collection, e.g. "songs" or "places:manipur".
 * `ready` turns true once the shared edits have loaded (or failed to).
 */
export function useOverlay<T extends { id: string }>(key: string | null, base: T[]) {
  const [local, setLocal] = useState<T[]>([]);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const fresh = useRef(false);

  const applyRemote = useCallback((rows: Remote[]) => {
    setLocal(rows.filter(r => !r.deleted && r.data).map(r => ({ ...r.data, id: r.id }) as T));
    setDeleted(rows.filter(r => r.deleted).map(r => r.id));
  }, []);

  const loadRemote = useCallback(async () => {
    if (!supabase || !key) return;
    const { data, error } = await supabase.from("items").select("id,data,deleted").eq("kind", key);
    if (error) return console.warn("Could not load shared edits:", error.message);
    setReady(true);
    fresh.current = true;
    applyRemote((data ?? []) as Remote[]);
    void cacheSet(`overlay:${key}`, data ?? []);
  }, [key, applyRemote]);

  useEffect(() => {
    setLocal([]); setDeleted([]); setReady(false); fresh.current = false;
    if (!key) return;
    if (!supabase) {
      setLocal(read<T>(`local-${key}`));
      setDeleted(read<string>(`local-${key}:deleted`));
      setReady(true);
      return;
    }
    let live = true;
    void cacheGet<Remote[]>(`overlay:${key}`).then(c => { if (live && !fresh.current && c) applyRemote(c); }); // offline copy first
    void loadRemote();
    return () => { live = false; };
  }, [key, applyRemote, loadRemote]);

  const items = useMemo(() => {
    const own = new Set(local.map(x => x.id)), gone = new Set(deleted);
    return [...base.filter(b => !own.has(b.id) && !gone.has(b.id)), ...local];
  }, [base, local, deleted]);

  // Local-only mode: write both lists to localStorage.
  const persistLocal = (nextLocal: T[], nextDeleted: string[]) => {
    if (!key) return;
    const ok = store.set(`local-${key}`, JSON.stringify(nextLocal)) && store.set(`local-${key}:deleted`, JSON.stringify(nextDeleted));
    if (!ok) void notify("Your browser blocked saving. Changes will be lost when you close this page.", "error");
  };

  // On a failed save the screen goes back to what the server really has.
  const upsert = async (rows: { id: string; data: unknown; deleted: boolean }[]) => {
    if (!supabase || !key || !rows.length) return;
    const { error } = await supabase.from("items").upsert(rows.map(r => ({ kind: key, ...r, updated_at: new Date().toISOString() })));
    if (error) { void fail(error.message); void loadRemote(); }
  };

  const apply = (nextLocal: T[], nextDeleted: string[]) => { setLocal(nextLocal); setDeleted(nextDeleted); if (!supabase) persistLocal(nextLocal, nextDeleted); };
  const strip = ({ id, ...rest }: T) => rest;

  const save = (item: Omit<T, "id">, id?: string) => {
    const next = { ...item, id: id ?? "local-" + Date.now().toString(36) } as T;
    apply(local.some(x => x.id === next.id) ? local.map(x => (x.id === next.id ? next : x)) : [...local, next], deleted);
    void upsert([{ id: next.id, data: strip(next), deleted: false }]);
  };

  const remove = async (id: string) => {
    const isBase = base.some(b => b.id === id);
    apply(local.filter(x => x.id !== id), isBase && !deleted.includes(id) ? [...deleted, id] : deleted);
    if (!supabase || !key) return;
    const { error } = isBase
      ? await supabase.from("items").upsert({ kind: key, id, data: null, deleted: true, updated_at: new Date().toISOString() })
      : await supabase.from("items").delete().eq("kind", key).eq("id", id);
    if (error) { void fail(error.message); void loadRemote(); }
  };

  const addMany = async (more: T[]) => {
    apply([...local, ...more], deleted);
    await upsert(more.map(m => ({ id: m.id, data: strip(m), deleted: false })));
    return true;
  };

  return { items, local, ready, localIds: useMemo(() => new Set(local.map(x => x.id)), [local]), save, remove, addMany };
}
