import { useEffect, useMemo, useRef, useState } from "react";
import { store } from "../../lib/data";
import { useOverlay } from "../../lib/overlay";
import { confirmAsk, notify, promptAsk, toastAction } from "../../lib/ui";
import { plural } from "../../lib/format";
import { FooterLinks } from "../../components/AboutPage";
import { usePageMeta } from "../../lib/pageMeta";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { PageHeader } from "../../ui/PageHeader";
import { SearchField } from "../../ui/SearchField";
import { Segmented } from "../../ui/Segmented";
import { EmptyState, Skeleton } from "../../ui/States";
import "./checklist.css";

export interface Catalog {
  trips: { id: string; label: string; icon: string; emoji?: string }[];
  categories: { id: string; label: string; icon: string; emoji?: string; items: string[] }[]; // items: "Name | trip trip"
}
interface Item { id: string; name: string; cat: string; trips: string[] }
interface Saved { sel: string[]; packed: string[]; custom: { id: string; name: string; cat: string }[]; presets: Record<string, string[]>; named: Record<string, string[]> } // presets: the user's own item list per trip type; named: lists saved under a name
type Mode = "choose" | "list";
const MAX_NAMED = 20;

const KEY = "checklist";

/** A friendly coloured emoji when the data has one, otherwise the line icon. */
const Glyph = ({ emoji, icon, size }: { emoji?: string; icon: string; size: number }) =>
  emoji ? <span className="glyph" style={{ fontSize: size }} aria-hidden="true">{emoji}</span> : <Icon name={icon} size={size} />;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function load(): Saved {
  try {
    const v = JSON.parse(store.get(KEY) ?? "{}");
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    const map = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? x as Record<string, string[]> : {});
    return { sel: list(v.sel), packed: list(v.packed), custom: list(v.custom), presets: map(v.presets), named: map(v.named) };
  } catch { return { sel: [], packed: [], custom: [], presets: {}, named: {} }; }
}

export function ChecklistPage({ catalog, admin, ready = true }: { catalog: Catalog | null; admin: boolean; ready?: boolean }) {
  usePageMeta("Trip packing checklist for picnics, camping and treks", "Tick what to bring for a picnic, camping, trek, road trip or day trip: food, utensils, tents, clothing, health and more. Share or print your list.");
  const [saved, setSaved] = useState<Saved>(load);
  // Reopens on the step you left (your list, if you were packing), not always on step 1.
  const [mode, setModeState] = useState<Mode>(() => (store.get("checklist-mode") === "list" && saved.sel.length > 0 ? "list" : "choose"));
  const setMode = (m: Mode) => { setModeState(m); store.set("checklist-mode", m); };
  const [openCats, setOpenCats] = useState<Set<string>>(new Set()); // categories the person opened by hand
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newCat, setNewCat] = useState("");

  useEffect(() => { store.set(KEY, JSON.stringify(saved)); }, [saved]);

  const [dialog, setDialog] = useState<{ editing: Item | null } | null>(null);
  const cats = useMemo(() => catalog?.categories ?? [], [catalog]);
  const baseItems = useMemo<Item[]>(() => cats.flatMap(c => c.items.map((raw, n) => {
    const [name, trips = ""] = raw.split("|").map(s => s.trim());
    // A name with no Latin letters (Hindi, Meitei…) has an empty slug: fall back to its position so ids never collide.
    return { id: `${c.id}:${slug(name) || "item-" + n}`, name, cat: c.id, trips: trips.split(/\s+/).filter(Boolean) };
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
  const presetIds = (tripId: string) => (saved.presets[tripId] ?? []).filter(id => items.some(i => i.id === id));
  const namedIds = (name: string) => (saved.named[name] ?? []).filter(id => items.some(i => i.id === id));
  const savePreset = (tripId: string) => update(s => ({ ...s, presets: { ...s.presets, [tripId]: s.sel } }));
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
    const cat = newCat || cats[0]?.id || "";
    update(s => ({ ...s, custom: [...s.custom, { id, name, cat }], sel: [...s.sel, id] }));
    setOpenCats(o => new Set(o).add(cat)); // show it where it landed
    void notify(`Added "${name}" to ${cats.find(c => c.id === cat)?.label ?? "your list"} and ticked it.`);
    setNewName("");
  };
  const removeCustom = (id: string) => update(s => ({
    ...s, custom: s.custom.filter(c => c.id !== id), sel: s.sel.filter(x => x !== id), packed: s.packed.filter(x => x !== id)
  }));

  const dropFromList = (i: Item) => {
    const wasPacked = packed.has(i.id);
    toggleSel([i.id], false);
    toastAction(`Removed "${i.name}" from your list`, "Undo", () => {
      update(s => ({ ...s, sel: s.sel.includes(i.id) ? s.sel : [...s.sel, i.id], packed: wasPacked && !s.packed.includes(i.id) ? [...s.packed, i.id] : s.packed }));
    });
  };
  const saveNamed = async () => {
    const raw = await promptAsk(`Name for this list of ${plural(saved.sel.length, "item")} (for example "Loktak weekend"):`);
    const name = raw?.trim().slice(0, 40);
    if (!name) return;
    if (!(name in saved.named) && Object.keys(saved.named).length >= MAX_NAMED) return void notify(`You can keep up to ${MAX_NAMED} lists. Delete one first.`, "error");
    if (name in saved.named && !(await confirmAsk(`Replace your list "${name}"?`, { yes: "Replace" }))) return;
    update(s => ({ ...s, named: { ...s.named, [name]: s.sel } }));
    void notify(`Saved "${name}".`);
  };

  const asText = () => cats.map(c => {
    const rows = chosen.filter(i => i.cat === c.id);
    return rows.length ? `${c.label}\n${rows.map(i => `${packed.has(i.id) ? "[x]" : "[ ]"} ${i.name}`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n");

  const share = async () => {
    const text = "Packing list\n\n" + asText();
    try {
      if (navigator.share) await navigator.share({ title: "Packing list", text });
      else { await navigator.clipboard.writeText(text); void notify("Copied. Paste it into WhatsApp or notes."); }
    } catch { /* user cancelled */ }
  };

  if (!catalog) {
    return (
      <div className="page">
        {ready
          ? <EmptyState title="Can't load the checklist" hint="Check your connection and try again." action={{ label: "Reload", onClick: () => location.reload() }} />
          : <Skeleton rows={4} kind="card" label="Loading checklist" />}
      </div>
    );
  }

  const anyPreset = catalog.trips.some(t => presetIds(t.id).length);
  // One tap saves what is ticked as that trip's list (in this browser). Asks first when it would replace a list.
  const saveAs = async (t: Catalog["trips"][number]) => {
    const had = presetIds(t.id).length;
    if (had && !(await confirmAsk(`Replace your ${plural(had, "saved item")} for ${t.label} with the ${saved.sel.length} ticked now?`, { yes: "Replace" }))) return;
    savePreset(t.id);
    void notify(`Saved ${plural(saved.sel.length, "item")} to ${t.label}.`);
  };
  const presetSaver = saved.sel.length > 0 ? (
    <div className="ck-save" role="group" aria-label="Save ticked items to a trip">
      <p className="ck-save-h">Save your <strong>{saved.sel.length}</strong> ticked items to:</p>
      <div className="ck-save-chips">
        {catalog.trips.map(t => (
          <button key={t.id} type="button" className="chip" onClick={() => saveAs(t)}>
            <Glyph emoji={t.emoji} icon={t.icon} size={16} /> {t.label}
          </button>
        ))}
      </div>
    </div>
  ) : null;
  const needle = q.trim().toLowerCase();
  const noMatch = !!needle && !items.some(i => i.name.toLowerCase().includes(needle));
  const pct = chosen.length ? Math.round((done / chosen.length) * 100) : 0;

  return (
    <div className={"page checklist" + (mode === "choose" && chosen.length > 0 ? " has-cta" : "")}>
      <PageHeader title="Trip checklist" sub={mode === "choose" ? "Pick what you need, then tick it off as you pack." : `${done} of ${chosen.length} packed`} />
      <Segmented label="Checklist steps" value={mode} onChange={setMode}
        options={[{ id: "choose", label: "1. Choose items" }, { id: "list", label: `2. My list (${chosen.length})` }]} />

      {mode === "choose" ? (
        <>
          <section className="ck-quick" aria-labelledby="ck-quick-h">
            <h2 id="ck-quick-h">Quick start</h2>
            <p className="ph-sub">{anyPreset
              ? "Tap a trip to tick your saved list for it."
              : "Your trip lists start empty. Tick items below, then save them to a trip."}</p>
            <div className="trip-grid" role="group" aria-label="Trip type">
              {catalog.trips.map(t => (
                <div key={t.id} className="trip-wrap">
                <button type="button" className="trip-tile" onClick={() => {
                  const ids = presetIds(t.id);
                  if (!ids.length) return void notify(`${t.label} is empty. Tick items below, then save them to ${t.label}.`);
                  toggleSel(ids, true);
                  void notify(`Ticked ${plural(ids.length, "item")} for ${t.label}.`);
                }}>
                  <span className="trip-emoji" aria-hidden="true"><Glyph emoji={t.emoji} icon={t.icon} size={30} /></span>
                  <span className="trip-name">{t.label}</span>
                  <span className="trip-n">{plural(presetIds(t.id).length, "item")}</span>
                </button>
                {presetIds(t.id).length > 0 && (
                  <IconButton className="sm trip-clear" icon="trash" label={`Clear my saved ${t.label} list`}
                    onClick={async () => { if (await confirmAsk(`Clear your ${plural(presetIds(t.id).length, "saved item")} for ${t.label}? Your ticks stay.`, { yes: "Clear list", danger: true })) update(s => { const { [t.id]: _gone, ...rest } = s.presets; return { ...s, presets: rest }; }); }} />
                )}
                </div>
              ))}
              <button type="button" className="trip-tile clear" onClick={async () => { if (await confirmAsk(`Untick all ${saved.sel.length} items?`, { yes: "Clear all", danger: true })) toggleSel(saved.sel, false); }} disabled={!saved.sel.length}>
                <span className="trip-emoji" aria-hidden="true"><Icon name="undo" size={26} /></span>
                <span className="trip-name">Clear all</span>
                <span className="trip-n">{saved.sel.length} ticked</span>
              </button>
            </div>
            {presetSaver}
            {(saved.sel.length > 0 || Object.keys(saved.named).length > 0) && (
              <div className="ck-save" role="group" aria-label="My saved lists">
                <p className="ck-save-h"><strong>My lists</strong>: keep as many as you like, under any name.</p>
                <div className="ck-save-chips">
                  {Object.keys(saved.named).map(name => (
                    <span key={name} className="ck-named">
                      <button type="button" className="chip" onClick={() => { const ids = namedIds(name); toggleSel(ids, true); void notify(`Ticked ${plural(ids.length, "item")} from "${name}".`); }}>
                        {name} <span className="chip-n">{namedIds(name).length}</span>
                      </button>
                      <IconButton className="sm" icon="trash" label={`Delete the list ${name}`}
                        onClick={async () => { if (await confirmAsk(`Delete your list "${name}"? Your ticks stay.`, { yes: "Delete", danger: true })) update(s => { const { [name]: _gone, ...rest } = s.named; return { ...s, named: rest }; }); }} />
                    </span>
                  ))}
                  {saved.sel.length > 0 && <button type="button" className="chip" onClick={saveNamed}><Icon name="plus" size={16} /> Save ticked items as a list</button>}
                </div>
              </div>
            )}
            {anyPreset && (
              <button type="button" className="link ck-reset" onClick={async () => { if (await confirmAsk("Remove all your saved trip lists? Your ticks stay.", { yes: "Remove lists", danger: true })) update(s => ({ ...s, presets: {} })); }}>Reset my saved trip lists</button>
            )}
          </section>

          <div className="ck-search"><SearchField value={q} onChange={setQ} placeholder="Search items" /></div>
          {noMatch && <EmptyState title={`No items match “${q.trim()}”`} hint="Add it as your own item below." action={{ label: "Clear search", onClick: () => setQ("") }} />}

          {cats.map(c => {
            const rows = items.filter(i => i.cat === c.id && (!needle || i.name.toLowerCase().includes(needle)));
            if (!rows.length) return null;
            const n = rows.filter(i => sel.has(i.id)).length;
            return (
              <details key={c.id} open={!!needle || openCats.has(c.id)} className="ck-card"
                onToggle={e => {
                  if (needle) return; // a search opens every match; that isn't the person's own choice
                  const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                  setOpenCats(o => { if (o.has(c.id) === isOpen) return o; const n = new Set(o); if (isOpen) n.add(c.id); else n.delete(c.id); return n; });
                }}>
                <summary>
                  <span className="ck-ic" aria-hidden="true"><Glyph emoji={c.emoji} icon={c.icon} size={22} /></span>
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
            <p className="ph-sub">Your list is saved in this browser, only for you.</p>
            <div className="ck-add-row">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Raincoat for the child" maxLength={80} aria-label="Custom item" />
              <select value={newCat} onChange={e => setNewCat(e.target.value)} aria-label="Category for custom item">
                {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
              <Button variant="primary" type="submit" icon="plus" disabled={!newName.trim()}>Add</Button>
            </div>
            {admin && <Button icon="plus" onClick={() => setDialog({ editing: null })}>Add item to the catalog (everyone)</Button>}
          </form>

          {chosen.length > 0 && <div className="ck-cta">
            <Button variant="primary" onClick={() => { setMode("list"); }} disabled={!chosen.length}>{chosen.length ? `View my list · ${chosen.length} items` : "Tick items to build your list"}</Button>
          </div>}
        </>
      ) : (
        <>
          {chosen.length === 0 ? (
            <div className="card ck-empty">
              <span className="ck-empty-ic" aria-hidden="true"><Icon name="backpack" size={40} /></span>
              <strong>Nothing chosen yet</strong>
              <p className="ph-sub">Pick a trip type or tick items to build your packing list.</p>
              <Button variant="primary" onClick={() => setMode("choose")}>Choose items</Button>
            </div>
          ) : (
            <>
              <section className="card ck-progress" aria-label="Packing progress">
                <div className="ckp-top">
                  <strong className="ckp-num">{done}<span>/{chosen.length}</span></strong>
                  <span className="ckp-label">packed{done === chosen.length ? " · all done" : ` · ${pct}%`}</span>
                </div>
                <div className="ckp-bar" role="progressbar" aria-label="Packed" aria-valuemin={0} aria-valuemax={chosen.length} aria-valuenow={done}><div style={{ width: `${pct}%` }} /></div>
              </section>
              <div className="ck-tools">
                <Button icon="share" onClick={share}>Share</Button>
                <Button icon="print" onClick={() => window.print()}>Print</Button>
                <Button icon="undo" onClick={async () => { if (await confirmAsk(`Mark all ${done} packed items as not packed?`, { yes: "Untick all", danger: true })) update(s => ({ ...s, packed: [] })); }} disabled={!done}>Untick all</Button>
              </div>
              {cats.map(c => {
                const rows = chosen.filter(i => i.cat === c.id);
                if (!rows.length) return null;
                const d = rows.filter(i => packed.has(i.id)).length;
                return (
                  <section key={c.id} className="ck-card open">
                    <h2 className="ck-head">
                      <span className="ck-ic" aria-hidden="true"><Glyph emoji={c.emoji} icon={c.icon} size={22} /></span>
                      <span className="ck-name">{c.label}</span>
                      <span className={"ck-count" + (d === rows.length ? " on" : "")}>{d}/{rows.length}</span>
                    </h2>
                    <ul className="ck-list">
                      {rows.map(i => (
                        <li key={i.id} className={"ck-row" + (packed.has(i.id) ? " done" : "")}>
                          <label className="ck-check"><input type="checkbox" checked={packed.has(i.id)} onChange={() => togglePacked(i.id)} /><span>{i.name}</span></label>
                          <IconButton className="sm" icon="x" label={`Remove ${i.name} from my list`} onClick={() => dropFromList(i)} />
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
        <ItemDialog editing={dialog.editing} cats={cats}
          onSave={(item, id) => { catalogItems.save(item, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

interface DialogProps {
  editing: Item | null; cats: Catalog["categories"];
  onSave: (item: Omit<Item, "id">, id?: string) => void; onClose: () => void;
}

function ItemDialog({ editing, cats, onSave, onClose }: DialogProps) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [cat, setCat] = useState(editing?.cat ?? cats[0]?.id ?? "");
  useEffect(() => { dlg.current?.showModal(); }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onSave({ name: name.trim(), cat, trips: editing?.trips ?? [] }, editing?.id);
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{editing ? "Edit item" : "Add item to catalog"}</h2>
        <label>Name *<input value={name} onChange={e => setName(e.target.value)} required maxLength={80} autoComplete="off" /></label>
        <label>Category
          <select value={cat} onChange={e => setCat(e.target.value)}>
            {cats.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Save item</button>
        </div>
      </form>
    </dialog>
  );
}
