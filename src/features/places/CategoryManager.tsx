import { useEffect, useRef, useState } from "react";
import type { Category } from "../../types";
import { confirmAsk, notify } from "../../lib/ui";
import { Button, IconButton } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

const ICON_CHOICES = ["landmark", "tree-pine", "utensils", "bed-double", "tree-palm", "coffee", "pin", "music", "home", "backpack", "shirt", "car"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

interface Props {
  categories: Category[];
  counts: Record<string, number>; // places per category, so a category in use can't be deleted
  usageOf?: (id: string) => Promise<number>; // places using it in every state (the counts above only cover the one on screen)
  onSave: (c: Omit<Category, "id">, id?: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

/** Admin: add, rename, recolour and delete place categories. */
export function CategoryManager({ categories, counts, usageOf, onSave, onDelete, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState("#1f7a5a");
  const [icon, setIcon] = useState("pin");
  useEffect(() => { dlg.current?.showModal(); }, []);

  const start = (c: Category | "new") => {
    setEditing(c);
    setLabel(c === "new" ? "" : c.label); setColor(c === "new" ? "#1f7a5a" : c.color); setIcon(c === "new" ? "pin" : c.icon);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    if (!name || !editing) return;
    if (editing === "new") {
      const id = slug(name) || "cat-" + Date.now().toString(36);
      if (categories.some(c => c.id === id)) return void notify("A category with that name already exists.", "error");
      onSave({ label: name, color, icon, sort: Math.max(-1, ...categories.map(c => c.sort ?? 0)) + 1 }, id);
    } else onSave({ label: name, color, icon, sort: editing.sort }, editing.id);
    setEditing(null);
  };
  // Reordering rewrites every category's position (0, 1, 2 …) so ties and gaps can't make the order ambiguous.
  const move = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= categories.length) return;
    const order = [...categories];
    [order[index], order[to]] = [order[to], order[index]];
    order.forEach((c, i) => { if (c.sort !== i) onSave({ label: c.label, color: c.color, icon: c.icon, sort: i }, c.id); });
  };
  const remove = async (c: Category) => {
    const used = Math.max(counts[c.id] ?? 0, usageOf ? await usageOf(c.id).catch(() => 0) : 0);
    if (used) return void notify(`"${c.label}" still has ${used} place(s). Move or delete them first.`, "error");
    if (await confirmAsk(`Delete the category "${c.label}"?`, { yes: "Delete", danger: true })) onDelete(c.id);
  };

  return (
    <dialog ref={dlg} onClose={onClose}>
      <div className="cat-mgr">
        <h2>Place categories</h2>
        {!editing && (
          <>
            <ul className="cat-list">
              {categories.map((c, i) => (
                <li key={c.id} className="cat-row">
                  <span className="cat-dot" style={{ background: c.color }} aria-hidden="true"><Icon name={c.icon} size={16} /></span>
                  <span className="cat-name">{c.label} <small>({counts[c.id] ?? 0})</small></span>
                  <IconButton className="sm" icon="chevron-up" label={`Move ${c.label} up`} onClick={() => move(i, -1)} disabled={i === 0} />
                  <IconButton className="sm" icon="chevron-down" label={`Move ${c.label} down`} onClick={() => move(i, 1)} disabled={i === categories.length - 1} />
                  <IconButton className="sm" icon="edit" label={`Edit ${c.label}`} onClick={() => start(c)} />
                  <IconButton className="sm danger" icon="trash" label={`Delete ${c.label}`} onClick={() => remove(c)} />
                </li>
              ))}
            </ul>
            <div className="actions">
              <Button icon="plus" onClick={() => start("new")}>Add category</Button>
              <Button variant="primary" onClick={() => dlg.current?.close()}>Done</Button>
            </div>
          </>
        )}
        {editing && (
          <form onSubmit={submit}>
            <label>Name *<input value={label} onChange={e => setLabel(e.target.value)} required maxLength={40} autoComplete="off" /></label>
            <label>Colour<input type="color" value={color} onChange={e => setColor(e.target.value)} /></label>
            <fieldset className="trip-pick">
              <legend>Icon</legend>
              {ICON_CHOICES.map(n => (
                <label key={n} className="check" title={n}>
                  <input type="radio" name="cat-icon" checked={icon === n} onChange={() => setIcon(n)} />
                  <Icon name={n} size={18} /><span className="sr-only">{n}</span>
                </label>
              ))}
            </fieldset>
            <div className="actions">
              <Button onClick={() => setEditing(null)}>Back</Button>
              <Button variant="primary" type="submit" disabled={!label.trim()}>Save category</Button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
