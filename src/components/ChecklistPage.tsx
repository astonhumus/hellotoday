import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../lib/data";
import { useOverlay } from "../lib/overlay";
import { confirmAsk, notify } from "../lib/ui";
import { FooterLinks } from "./AboutPage";
import { usePageMeta } from "../lib/pageMeta";

export interface Catalog {
  trips: { id: string; label: string; icon: string }[];
  categories: { id: string; label: string; icon: string; items: string[] }[]; // items: "Name | trip trip"
}
interface Item { id: string; name: string; cat: string; trips: string[] }
interface Saved { sel: string[]; packed: string[]; custom: { id: string; name: string; cat: string }[] }

const KEY = "checklist";
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function load(): Saved {
  try {
    const v = JSON.parse(store.get(KEY) ?? "{}");
    return { sel: v.sel ?? [], packed: v.packed ?? [], custom: v.custom ?? [] };
  } catch { return { sel: [], packed: [], custom: [] }; }
}

export function ChecklistPage({ catalog, admin }: { catalog: Catalog | null; admin: boolean }) {
  usePageMeta("Trip packing checklist for picnics, camping and treks", "Tick what to bring for a picnic, camping, trek, road trip or day trip: food, utensils, tents, clothing, health and more. Share or print your list.");
  const [saved, setSaved] = useState<Saved>(load);
  const [mode, setMode] = useState<"choose" | "list">(() => (load().sel.length ? "list" : "choose"));
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");

  useEffect(() => { store.set(KEY, JSON.stringify(saved)); }, [saved]);

  const [dialog, setDialog] = useState<{ editing: Item | null } | null>(null);
  const cats = useMemo(() => catalog?.categories ?? [], [catalog]);
  const baseItems = useMemo<Item[]>(() => cats.flatMap(c => c.items.map(raw => {
    const [name, trips = ""] = raw.split("|").map(s => s.trim());
    return { id: `${c.id}:${slug(name)}`, name, cat: c.id, trips: trips.split(/\s+/).filter(Boolean) };
  })), [cats]);
  // Admin changes to the shared catalog (add / edit / delete); see supabase/schema.sql.
  const catalogItems = useOverlay<Item>("checklist", baseItems);
  const items = useMemo<Item[]>(() => [
    ...catalogItems.items,
    ...saved.custom.map(c => ({ ...c, trips: [] as string[] }))
  ], [catalogItems.items, saved.custom]);

  // Forget ticks for items an admin has since deleted (only once the full catalog has loaded).
  useEffect(() => {
    if (!catalogItems.ready) return;
    const known = new Set(items.map(i => i.id));
    setSaved(s => (s.sel.every(id => known.has(id)) && s.packed.every(id => known.has(id))
      ? s : { ...s, sel: s.sel.filter(id => known.has(id)), packed: s.packed.filter(id => known.has(id)) }));
  }, [catalogItems.ready, items]);

  const sel = useMemo(() => new Set(saved.sel), [saved.sel]);
  const packed = useMemo(() => new Set(saved.packed), [saved.packed]);
  const chosen = items.filter(i => sel.has(i.id));
  const done = chosen.filter(i => packed.has(i.id)).length;

  const update = (f: (s: Saved) => Saved) => setSaved(f);
  const toggleSel = (ids: string[], on: boolean) => update(s => {
    const set = new Set(s.sel);
    ids.forEach(id => (on ? set.add(id) : set.delete(id)));
    return { ...s, sel: [...set], packed: s.packed.filter(id => set.has(id)) };
  });
  const togglePacked = (id: string) => update(s => ({ ...s, packed: s.packed.includes(id) ? s.packed.filter(x => x !== id) : [...s.packed, id] }));

  const addCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const id = "custom:" + Date.now().toString(36);
    update(s => ({ ...s, custom: [...s.custom, { id, name, cat: newCat || cats[0]?.id || "" }], sel: [...s.sel, id] }));
    setNewName("");
  };
  const removeCustom = (id: string) => update(s => ({
    custom: s.custom.filter(c => c.id !== id), sel: s.sel.filter(x => x !== id), packed: s.packed.filter(x => x !== id)
  }));

  const asText = () => cats.map(c => {
    const rows = chosen.filter(i => i.cat === c.id);
    return rows.length ? `${c.icon} ${c.label}\n${rows.map(i => `${packed.has(i.id) ? "[x]" : "[ ]"} ${i.name}`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n");

  const share = async () => {
    const text = "Packing list\n\n" + asText();
    try {
      if (navigator.share) await navigator.share({ title: "Packing list", text });
      else { await navigator.clipboard.writeText(text); void notify("Copied. Paste it into WhatsApp or notes."); }
    } catch { /* user cancelled */ }
  };

  if (!catalog) return <div className="page"><div className="empty">Loading checklist…</div></div>;

  const needle = q.trim().toLowerCase();

  return (
    <div className="page checklist">
      <h1>Trip checklist</h1>
      <div className="seg" role="group" aria-label="Checklist steps">
        <button className="chip" aria-pressed={mode === "choose"} onClick={() => setMode("choose")}>1. Choose items</button>
        <button className="chip" aria-pressed={mode === "list"} onClick={() => setMode("list")}>2. My list ({chosen.length})</button>
      </div>

      {mode === "choose" ? (
        <>
          <div className="hint">Quick start: tap a trip type to tick everything usually needed, then adjust.</div>
          <div className="chips wrap" role="group" aria-label="Trip type">
            {catalog.trips.map(t => (
              <button key={t.id} className="chip" onClick={() => toggleSel(items.filter(i => i.trips.includes(t.id)).map(i => i.id), true)}>
                {t.icon} {t.label}
              </button>
            ))}
            <button className="chip" onClick={() => toggleSel(saved.sel, false)} disabled={!saved.sel.length}>Clear all</button>
          </div>
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search items…" aria-label="Search items" />
          {cats.map(c => {
            const rows = items.filter(i => i.cat === c.id && (!needle || i.name.toLowerCase().includes(needle)));
            if (!rows.length) return null;
            const n = rows.filter(i => sel.has(i.id)).length;
            return (
              <details key={c.id} open={!!needle || undefined} className="ck-group">
                <summary>
                  <span>{c.icon} {c.label}</span>
                  <span className="chip-n">{n}/{rows.length}</span>
                </summary>
                <div className="ck-actions">
                  <button className="link" onClick={() => toggleSel(rows.map(i => i.id), true)}>Select all</button>
                  <button className="link" onClick={() => toggleSel(rows.map(i => i.id), false)}>None</button>
                </div>
                <ul className="ck-items">
                  {rows.map(i => (
                    <li key={i.id}>
                      <label><input type="checkbox" checked={sel.has(i.id)} onChange={e => toggleSel([i.id], e.target.checked)} /> {i.name}</label>
                      {i.id.startsWith("custom:") && <button className="link danger" onClick={() => removeCustom(i.id)}>Remove</button>}
                      {admin && !i.id.startsWith("custom:") && (
                        <span className="row-actions">
                          <button className="link" onClick={() => setDialog({ editing: i })}>Edit</button>
                          <button className="link danger" onClick={async () => { if (await confirmAsk(`Delete "${i.name}" from the catalog for everyone?`, { yes: "Delete", danger: true })) { void catalogItems.remove(i.id); toggleSel([i.id], false); } }}>Delete</button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
          {admin && <button className="btn" onClick={() => setDialog({ editing: null })}>+ Add item to catalog (everyone)</button>}
          <form className="ck-add" onSubmit={addCustom}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a personal item (only on this device)…" maxLength={80} aria-label="Custom item" />
            <select value={newCat} onChange={e => setNewCat(e.target.value)} aria-label="Category for custom item">
              {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
            <button className="btn primary" type="submit" disabled={!newName.trim()}>Add</button>
          </form>
          <button className="btn primary" onClick={() => setMode("list")} disabled={!chosen.length}>Make my list ({chosen.length})</button>
        </>
      ) : (
        <>
          {chosen.length === 0 ? (
            <div className="empty">Nothing chosen yet. Go to “Choose items”.</div>
          ) : (
            <>
              <div className="ck-progress">
                <div className="bar"><div style={{ width: `${(done / chosen.length) * 100}%` }} /></div>
                <span>{done} of {chosen.length} packed{done === chosen.length ? " 🎉" : ""}</span>
              </div>
              <div className="tools">
                <button className="btn" onClick={share}>Share / copy</button>
                <button className="btn" onClick={() => window.print()}>Print</button>
                <button className="btn" onClick={() => update(s => ({ ...s, packed: [] }))} disabled={!done}>Untick all</button>
              </div>
              {cats.map(c => {
                const rows = chosen.filter(i => i.cat === c.id);
                if (!rows.length) return null;
                return (
                  <section key={c.id} className="ck-group">
                    <h2>{c.icon} {c.label} <span className="chip-n">{rows.filter(i => packed.has(i.id)).length}/{rows.length}</span></h2>
                    <ul className="ck-items">
                      {rows.map(i => (
                        <li key={i.id} className={packed.has(i.id) ? "done" : ""}>
                          <label><input type="checkbox" checked={packed.has(i.id)} onChange={() => togglePacked(i.id)} /> {i.name}</label>
                          <button className="link" onClick={() => toggleSel([i.id], false)} aria-label={`Remove ${i.name}`}>✕</button>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
          <button className="btn" onClick={() => setMode("choose")}>+ Add more items</button>
        </>
      )}
      <FooterLinks />
      {dialog && (
        <ItemDialog editing={dialog.editing} cats={cats} trips={catalog.trips}
          onSave={(item, id) => { catalogItems.save(item, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

interface DialogProps {
  editing: Item | null; cats: Catalog["categories"]; trips: Catalog["trips"];
  onSave: (item: Omit<Item, "id">, id?: string) => void; onClose: () => void;
}

function ItemDialog({ editing, cats, trips, onSave, onClose }: DialogProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [cat, setCat] = useState(editing?.cat ?? cats[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>(editing?.trips ?? []);
  useEffect(() => { dlg.current?.showModal(); }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave({ name: name.trim(), cat, trips: picked }, editing?.id);
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{editing ? "Edit item" : "Add item to catalog"}</h2>
        <label>Name *<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoComplete="off" /></label>
        <label>Category
          <select value={cat} onChange={e => setCat(e.target.value)}>
            {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </label>
        <fieldset className="trip-pick">
          <legend>Pre-ticked for these trip types</legend>
          {trips.map(t => (
            <label key={t.id} className="check">
              <input type="checkbox" checked={picked.includes(t.id)}
                onChange={e => setPicked(p => (e.target.checked ? [...p, t.id] : p.filter(x => x !== t.id)))} /> {t.icon} {t.label}
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Save item</button>
        </div>
      </form>
    </dialog>
  );
}
