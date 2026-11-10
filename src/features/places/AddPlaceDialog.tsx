import { useEffect, useRef, useState } from "react";
import type { Category, Place } from "../../types";
import { formatCoords, parseCoords } from "../../lib/coords";
import { notify } from "../../lib/ui";
import { LocationPicker } from "./LocationPicker";
import { useDirtyClose } from "../../lib/useDirtyClose";

interface Props {
  categories: Category[];
  districts: string[];
  editing: Place | null;
  center?: [number, number];
  zoom?: number;
  onSave: (p: Omit<Place, "id">, id?: string) => void;
  onClose: () => void;
}

// Local date (not UTC), so people in India can pick today before 5:30am.
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : "");

export function AddPlaceDialog({ categories, districts, editing, center, zoom, onSave, onClose }: Props) {
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
  const dirty = name !== (editing?.name ?? "") || district !== (editing?.district ?? "") || desc !== (editing?.desc ?? "") || phone !== (editing?.phone ?? "")
    || website !== (editing?.website ?? "") || notes !== (editing?.notes ?? "") || visited !== (editing?.visited ?? "") || category !== (editing?.category ?? categories[0]?.id ?? "")
    || coordText !== (editing ? formatCoords(editing.lat, editing.lng) : "") || approx !== (editing?.approx ?? false);
  const cancel = useDirtyClose(dlg, dirty);
  const parsed = parseCoords(coordText);
  const [locating, setLocating] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  // Turn on GPS and fill in the coordinates from where the admin is standing.
  const locate = () => {
    if (!navigator.geolocation) return void notify("This browser can't give your location.", "error");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false);
        setCoordText(formatCoords(pos.coords.latitude, pos.coords.longitude));
        setAccuracy(Math.round(pos.coords.accuracy));
        setApprox(pos.coords.accuracy > 100); // a weak GPS fix is flagged as approximate
      },
      err => {
        setLocating(false);
        void notify(err.code === err.PERMISSION_DENIED ? "Location is blocked. Allow it for this site in your browser settings, then try again."
          : "Couldn't get your location. Move to an open area and try again.", "error");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed || !name.trim()) return;
    if (website.trim() && !safeUrl(website.trim())) return void notify("The website must start with http:// or https://", "error");
    onSave({
      name: name.trim(), category, district: district.trim() || undefined, lat: parsed.lat, lng: parsed.lng,
      desc: desc.trim() || undefined, phone: phone.trim() || undefined,
      website: safeUrl(website.trim()) || undefined, approx: approx || undefined,
      visited: visited || undefined, notes: notes.trim() || undefined,
      // An edit keeps the place's closure as it is (the form does not change it).
      ...(editing ? { closure: editing.closure, closureNote: editing.closureNote, closedOn: editing.closedOn } : {})
    }, editing?.id);
  };

  const hint = parsed
    ? `Latitude ${parsed.lat.toFixed(5)}, longitude ${parsed.lng.toFixed(5)}`
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
              {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label>District<input value={district} onChange={e => setDistrict(e.target.value)} list="district-list" maxLength={60} autoComplete="off" /></label>
        </div>
        <datalist id="district-list">{districts.map(d => <option key={d} value={d} />)}</datalist>
        <div className="loc-bar">
          <button type="button" className="btn" onClick={locate} disabled={locating}>{locating ? "Getting your location…" : "Use my current location (GPS)"}</button>
          {accuracy != null && <span className="hint">Accurate to about {accuracy} m</span>}
        </div>
        <LocationPicker center={center} zoom={zoom} point={parsed} accuracy={accuracy} onMove={p => { setCoordText(formatCoords(p.lat, p.lng)); setAccuracy(null); }} />
        <label>Coordinates *
          <input value={coordText} onChange={e => setCoordText(e.target.value)} required autoComplete="off"
            placeholder="24.8089, 93.9426" />
        </label>
        <p className={"hint" + (coordText && !parsed ? " bad" : "")}>{hint}</p>
        <label>Description<textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} maxLength={1000} /></label>
        <details className="more" open={!!(editing && (editing.visited || editing.notes || editing.phone || editing.website || editing.approx))}>
          <summary>More details</summary>
          <div className="more-body">
            <div className="row">
              <label>Date last checked (shown publicly)<input type="date" value={visited} onChange={e => setVisited(e.target.value)} max={today()} /></label>
            </div>
            <label>Tips (shown publicly)<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="What to order, best time, who to ask for, parking…" /></label>
            <div className="row">
              <label>Phone<input value={phone} onChange={e => setPhone(e.target.value)} type="tel" maxLength={40} /></label>
              <label>Website<input value={website} onChange={e => setWebsite(e.target.value)} type="url" placeholder="https://" maxLength={300} /></label>
            </div>
            <label className="check"><input type="checkbox" checked={approx} onChange={e => setApprox(e.target.checked)} /> Location is approximate</label>
          </div>
        </details>
        <div className="actions">
          <button type="button" className="btn" onClick={cancel}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!parsed || !name.trim()}>Save place</button>
        </div>
      </form>
    </dialog>
  );
}
