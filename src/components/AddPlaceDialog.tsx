import { useEffect, useRef, useState } from "react";
import type { Category, Place } from "../types";
import { formatCoords, parseCoords } from "../lib/coords";

interface Props {
  categories: Category[];
  districts: string[];
  editing: Place | null;
  onSave: (p: Omit<Place, "id">, id?: string) => void;
  onClose: () => void;
}

// Local date (not UTC), so people in India can pick today before 5:30am.
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

export function AddPlaceDialog({ categories, districts, editing, onSave, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(editing?.name ?? "");
  const [category, setCategory] = useState(editing?.category ?? categories[0]?.id ?? "");
  const [district, setDistrict] = useState(editing?.district ?? "");
  const [coordText, setCoordText] = useState(editing ? formatCoords(editing.lat, editing.lng) : "");
  const [desc, setDesc] = useState(editing?.desc ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [website, setWebsite] = useState(editing?.website ?? "");
  const [approx, setApprox] = useState(editing?.approx ?? false);
  const [visited, setVisited] = useState(editing?.visited ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  useEffect(() => { dlg.current?.showModal(); }, []);
  const parsed = parseCoords(coordText);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || !name.trim()) return;
    onSave({
      name: name.trim(), category, district: district.trim() || undefined, lat: parsed.lat, lng: parsed.lng,
      desc: desc.trim() || undefined, phone: phone.trim() || undefined,
      website: safeUrl(website.trim()) || undefined, approx: approx || undefined,
      visited: visited || undefined, notes: notes.trim() || undefined
    }, editing?.id);
  };

  const hint = parsed
    ? `✓ Latitude ${parsed.lat.toFixed(5)}, longitude ${parsed.lng.toFixed(5)}`
    : coordText
      ? "Couldn't read that. Use “lat, lng”, degrees/minutes/seconds, or a Google Maps link."
      : "In Google Maps, right-click a spot and click the coordinates to copy them, then paste here.";

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{editing ? "Edit place" : "Add a place"}</h2>
        <label>Name *<input value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoComplete="off" /></label>
        <div className="row">
          <label>Category *
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
            </select>
          </label>
          <label>District<input value={district} onChange={e => setDistrict(e.target.value)} list="district-list" maxLength={60} autoComplete="off" /></label>
        </div>
        <datalist id="district-list">{districts.map(d => <option key={d} value={d} />)}</datalist>
        <label>Coordinates *
          <input value={coordText} onChange={e => setCoordText(e.target.value)} required autoComplete="off"
            placeholder="Paste from Google Maps: 24.8089, 93.9426" />
        </label>
        <p className={"hint" + (coordText && !parsed ? " bad" : "")}>{hint}</p>
        <label>Description<textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={1000} /></label>
        <div className="row">
          <label>Visited on<input type="date" value={visited} onChange={e => setVisited(e.target.value)} max={today()} /></label>
        </div>
        <label>My notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="What to order, best time, who to ask for, parking…" /></label>
        <div className="row">
          <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" maxLength={40} /></label>
          <label>Website<input value={website} onChange={e => setWebsite(e.target.value)} type="url" placeholder="https://" maxLength={300} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={approx} onChange={e => setApprox(e.target.checked)} /> Location is approximate</label>
        <div className="actions">
          <button type="button" className="btn" onClick={() => dlg.current?.close()}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!parsed || !name.trim()}>Save place</button>
        </div>
      </form>
    </dialog>
  );
}
