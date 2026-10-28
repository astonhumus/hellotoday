import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../../lib/data";
import { useOverlay } from "../../lib/overlay";
import { confirmAsk, notify } from "../../lib/ui";
import { FooterLinks } from "../../components/AboutPage";
import { usePageMeta } from "../../lib/pageMeta";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import { SearchField } from "../../ui/SearchField";
import { Segmented } from "../../ui/Segmented";
import "./checklist.css";

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
  const pct = chosen.length ? Math.round((done / chosen.length) * 100) : 0;

  return (
    <div className="page checklist">
      <PageHeader title="Trip checklist" sub={mode === "choose" ? "Pick what you need, then tick it off as you pack." : `${done} of ${chosen.length} packed`} />
      <Segmented label="Checklist steps" value={mode} onChange={setMode}
        options={[{ id: "choose", label: "1. Choose items" }, { id: "list", label: `2. My list (${chosen.length})` }]} />

      {mode === "choose" ? (
        <>
          <section className="ck-quick" aria-labelledby="ck-quick-h">
            <h2 id="ck-quick-h">Quick start</h2>
            <p className="ph-sub">Tap a trip type to tick everything usually needed, then adjust.</p>
            <div className="trip-grid" role="group" aria-label="Trip type">
              {catalog.trips.map(t => (
                <button key={t.id} type="button" className="trip-tile" onClick={() => toggleSel(items.filter(i => i.trips.includes(t.id)).map(i => i.id), true)}>
                  <span className="trip-emoji" aria-hidden="true">{t.icon}</span>
                  <span className="trip-name">{t.label}</span>
                  <span className="trip-n">{items.filter(i => i.trips.includes(t.id)).length} items</span>
                </button>
              ))}
              <button type="button" className="trip-tile clear" onClick={() => toggleSel(saved.sel, false)} disabled={!saved.sel.length}>
                <span className="trip-emoji" aria-hidden="true"><Icon name="undo" size={24} /></span>
                <span className="trip-name">Clear all</span>
                <span className="trip-n">{saved.sel.length} ticked</span>
              </button>
            </div>
          </section>

          <SearchField value={q} onChange={setQ} placeholder="Search items" />

          {cats.map(c => {
            const rows = items.filter(i => i.cat === c.id && (!needle || i.name.toLowerCase().includes(needle)));
            if (!rows.length) return null;
            const n = rows.filter(i => sel.has(i.id)).length;
            return (
              <details key={c.id} open={!!needle || undefined} className="ck-card">
                <summary>
                  <span className="ck-ic" aria-hidden="true">{c.icon}</span>
                  <span className="ck-name">{c.label}</span>
                  <span className={"ck-count" + (n ? " on" : "")}>{n}/{rows.length}</span>
                  <Icon name="chevron-down" size={18} />
                </summary>
                <div className="ck-actions">
                  <button type="button" className="link" onClick={() => toggleSel(rows.map(i => i.id), true)}>Select all</button>
                  <button type="button" className="link" onClick={() => toggleSel(rows.map(i => i.id), false)}>None</button>
                </div>
                <ul className="ck-list">
                  {rows.map(i => (
                    <li key={i.id} className="ck-row">
                      <label className="ck-check"><input type="checkbox" checked={sel.has(i.id)} onChange={e => toggleSel([i.id], e.target.checked)} /><span>{i.name}</span></label>
                      {i.id.startsWith("custom:") && <IconButton className="sm" icon="x" label={`Remove ${i.name}`} onClick={() => removeCustom(i.id)} />}
                      {admin && !i.id.startsWith("custom:") && (
                        <span className="ck-admin">
                          <IconButton className="sm" icon="edit" label={`Edit ${i.name}`} onClick={() => setDialog({ editing: i })} />
                          <IconButton className="sm danger" icon="trash" label={`Delete ${i.name}`} onClick={async () => { if (await confirmAsk(`Delete "${i.name}" from the catalog for everyone?`, { yes: "Delete", danger: true })) { void catalogItems.remove(i.id); toggleSel([i.id], false); } }} />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}

          <form className="card ck-add" onSubmit={addCustom}>
            <h2>Add your own item</h2>
            <p className="ph-sub">Saved only on this device.</p>
            <div className="ck-add-row">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Raincoat for the child" maxLength={80} aria-label="Custom item" />
              <select value={newCat} onChange={e => setNewCat(e.target.value)} aria-label="Category for custom item">
                {cats.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
              </select>
              <Button variant="primary" type="submit" icon="plus" disabled={!newName.trim()}>Add</Button>
            </div>
            {admin && <Button icon="plus" onClick={() => setDialog({ editing: null })}>Add item to the catalog (everyone)</Button>}
          </form>

          <div className="ck-cta">
            <Button variant="primary" onClick={() => setMode("list")} disabled={!chosen.length}>Make my list ({chosen.length})</Button>
          </div>
        </>
      ) : (
        <>
          {chosen.length === 0 ? (
            <div className="card ck-empty">
              <span className="ck-empty-ic" aria-hidden="true">🎒</span>
              <strong>Nothing chosen yet</strong>
              <p className="ph-sub">Pick a trip type or tick items to build your packing list.</p>
              <Button variant="primary" onClick={() => setMode("choose")}>Choose items</Button>
            </div>
          ) : (
            <>
              <section className="card ck-progress" aria-label="Packing progress">
                <div className="ckp-top">
                  <strong className="ckp-num">{done}<span>/{chosen.length}</span></strong>
                  <span className="ckp-label">packed{done === chosen.length ? " 🎉" : ` · ${pct}%`}</span>
                </div>
                <div className="ckp-bar" role="progressbar" aria-label="Packed" aria-valuemin={0} aria-valuemax={chosen.length} aria-valuenow={done}><div style={{ width: `${pct}%` }} /></div>
              </section>
              <div className="ck-tools">
                <Button icon="share" onClick={share}>Share</Button>
                <Button icon="print" onClick={() => window.print()}>Print</Button>
                <Button icon="undo" onClick={() => update(s => ({ ...s, packed: [] }))} disabled={!done}>Untick all</Button>
              </div>
              {cats.map(c => {
                const rows = chosen.filter(i => i.cat === c.id);
                if (!rows.length) return null;
                const d = rows.filter(i => packed.has(i.id)).length;
                return (
                  <section key={c.id} className="ck-card open">
                    <h2 className="ck-head">
                      <span className="ck-ic" aria-hidden="true">{c.icon}</span>
                      <span className="ck-name">{c.label}</span>
                      <span className={"ck-count" + (d === rows.length ? " on" : "")}>{d}/{rows.length}</span>
                    </h2>
                    <ul className="ck-list">
                      {rows.map(i => (
                        <li key={i.id} className={"ck-row" + (packed.has(i.id) ? " done" : "")}>
                          <label className="ck-check"><input type="checkbox" checked={packed.has(i.id)} onChange={() => togglePacked(i.id)} /><span>{i.name}</span></label>
                          <IconButton className="sm" icon="x" label={`Remove ${i.name} from my list`} onClick={() => toggleSel([i.id], false)} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
              <Button icon="plus" onClick={() => setMode("choose")}>Add more items</Button>
            </>
          )}
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
