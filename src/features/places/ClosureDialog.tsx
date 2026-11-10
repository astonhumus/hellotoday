import { useEffect, useRef, useState } from "react";
import type { Place } from "../../types";
import { LIMITS } from "../../lib/limits";
import { Button } from "../../ui/Button";

type Closure = NonNullable<Place["closure"]>;

interface Props {
  place: Place;
  onSave: (closure: Closure | null, note: string) => void; // null = reopen
  onClose: () => void;
}

/** Admin / contributor: mark a place as temporarily or permanently closed (archived), or reopen it. */
export function ClosureDialog({ place, onSave, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [closure, setClosure] = useState<Closure>(place.closure ?? "temporary");
  const [note, setNote] = useState(place.closureNote ?? "");
  useEffect(() => { dlg.current?.showModal(); }, []);

  return (
    <dialog ref={dlg} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); onSave(closure, note.trim()); dlg.current?.close(); }}>
        <h2>{place.closure ? "Closure of this place" : "Close or archive this place"}</h2>
        <p className="hint">{place.name}</p>
        <fieldset className="closure-pick">
          <legend>Status</legend>
          <label className="check"><input type="radio" name="closure" checked={closure === "temporary"} onChange={() => setClosure("temporary")} />
            <span><strong>Temporarily closed</strong><small>Stays on the map and in lists, with a notice and a faded pin.</small></span></label>
          <label className="check"><input type="radio" name="closure" checked={closure === "permanent"} onChange={() => setClosure("permanent")} />
            <span><strong>Permanently closed (archive)</strong><small>Hidden from visitors. Only admins and contributors can still see it, and can reopen it.</small></span></label>
        </fieldset>
        <label>Reason (shown to visitors for a temporary closure)
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={LIMITS.closureNote}
            placeholder={closure === "temporary" ? "e.g. Closed for repairs, reopens in March" : "e.g. The shop has shut down"} />
        </label>
        <div className="actions">
          <Button onClick={() => dlg.current?.close()}>Cancel</Button>
          {place.closure && <Button onClick={() => { onSave(null, ""); dlg.current?.close(); }}>Reopen place</Button>}
          <Button variant={closure === "permanent" ? "danger" : "primary"} type="submit">{closure === "permanent" ? "Archive place" : "Mark as closed"}</Button>
        </div>
      </form>
    </dialog>
  );
}
