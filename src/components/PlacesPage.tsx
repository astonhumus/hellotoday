import { useMemo, useState } from "react";
import type { Category, Place, StateInfo } from "../types";
import { MapView } from "./MapView";
import { AddPlaceDialog } from "./AddPlaceDialog";

interface Props {
  state: StateInfo;
  categories: Category[];
  places: Place[];
  localIds: Set<string>;
  admin: boolean;
  canDelete: boolean;
  onSavePlace: (p: Omit<Place, "id">, id?: string) => void;
  onDeletePlace: (id: string) => void;
  exportCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
}

export function PlacesPage({ state, categories, places, localIds, admin, canDelete, onSavePlace, onDeletePlace, exportCount, onExport, onImport }: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set()); // empty = all categories
  const [district, setDistrict] = useState("all");
  const [q, setQ] = useState("");
  const [visitedOnly, setVisitedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ editing: Place | null } | null>(null);

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    places.forEach(p => { m[p.category] = (m[p.category] ?? 0) + 1; });
    return m;
  }, [places]);
  const districts = useMemo(() => [...new Set(places.map(p => p.district).filter(Boolean) as string[])].sort(), [places]);
  const visibleCats = categories.filter(c => counts[c.id]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return places
      .filter(p => (!picked.size || picked.has(p.category)) &&
        (district === "all" || p.district === district) &&
        (!visitedOnly || p.visited) &&
        (!needle || [p.name, p.desc, p.district, p.notes].join(" ").toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [places, picked, district, q, visitedOnly]);

  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="places">
      <aside>
        <div className="controls">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search places…" aria-label="Search places" />
          <div className="chips" role="group" aria-label="Filter by category">
            <button className="chip" aria-pressed={picked.size === 0} onClick={() => setPicked(new Set())}>All</button>
            <button className="chip" aria-pressed={visitedOnly} onClick={() => setVisitedOnly(v => !v)}>✅ Visited</button>
            {visibleCats.map(c => (
              <button key={c.id} className="chip" aria-pressed={picked.has(c.id)} onClick={() => toggle(c.id)}>
                <span className="dot" style={{ background: c.color }} /> {c.label} <span className="chip-n">{counts[c.id]}</span>
              </button>
            ))}
          </div>
          <select value={district} onChange={e => setDistrict(e.target.value)} aria-label="Filter by district">
            <option value="all">All districts</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {admin && (
            <div className="tools">
              <button className="btn primary" onClick={() => setDialog({ editing: null })}>+ Add place</button>
              <button className="btn" onClick={onExport} disabled={!exportCount}>Export ({exportCount})</button>
              <label className="btn file">Import
                <input type="file" accept=".json,application/json" hidden
                  onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f); }} />
              </label>
            </div>
          )}
          <div className="count">{filtered.length} place{filtered.length === 1 ? "" : "s"}</div>
        </div>
        <ul>
          {filtered.length === 0 && <div className="empty">No places match your filters.</div>}
          {filtered.map(p => {
            const c = catById[p.category];
            const local = localIds.has(p.id);
            return (
              <li key={p.id} className={p.id === selectedId ? "active" : ""} onClick={() => setSelectedId(p.id)}>
                <span className="dot" style={{ background: c?.color ?? "#64748b" }} />
                <span className="name">{p.name}</span>
                <span className="meta">{c?.label ?? p.category}{p.district ? ` · ${p.district}` : ""}{p.approx ? " · approx." : ""}{local ? " · edited/added" : ""}</span>
                {p.desc && <span className="desc">{p.desc}</span>}
                {p.notes && <span className="desc notes">📝 {p.notes}</span>}
                {p.status && p.status !== "approved" && <span className={"badge " + p.status}>{p.status === "pending" ? "⏳ Waiting for approval" : `✖ Rejected${p.reviewNote ? ": " + p.reviewNote : ""}`}</span>}
                {p.visited && <span className="meta">✅ Visited {p.visited}</span>}
                {admin && (
                  <span className="row-actions" onClick={e => e.stopPropagation()}>
                    <button className="link" onClick={() => setDialog({ editing: p })}>Edit</button>
                    {canDelete && <button className="link danger" onClick={() => confirm(`Delete "${p.name}"?`) && onDeletePlace(p.id)}>Delete</button>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
      <div className="map-wrap">
        <MapView state={state} places={filtered} categories={catById} selectedId={selectedId} onSelect={setSelectedId} />
      </div>
      {dialog && (
        <AddPlaceDialog categories={categories} districts={districts} editing={dialog.editing}
          onSave={(p, id) => { onSavePlace(p, id); setDialog(null); }} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}
