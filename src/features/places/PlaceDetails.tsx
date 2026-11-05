import { useState } from "react";
import type { Category, Place } from "../../types";
import { formatCoords } from "../../lib/coords";
import { appleMapsUrl, googleMapsUrl } from "../../lib/nav";
import { formatKm } from "../../lib/geo";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

interface Props {
  place: Place;
  category?: Category;
  visited: boolean;
  visitedOn?: string;
  onToggleVisited: () => void;
  admin: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  distanceKm?: number;        // straight-line distance from the visitor's GPS position, once known
  onLocate?: () => void;      // ask for the position (or measure again)
  locating?: boolean;
}

/** Everything about one place, with the actions people actually want: directions, call, website, mark as visited. */
export function PlaceDetails({ place: p, category: c, visited, visitedOn, onToggleVisited, admin, canDelete, onEdit, onDelete, distanceKm, onLocate, locating }: Props) {
  const [copied, setCopied] = useState(false);
  const coords = formatCoords(p.lat, p.lng);
  const copy = () => navigator.clipboard?.writeText(coords).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const apple = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent); // the Apple Maps link only helps on Apple devices
  const web = p.website && /^https?:\/\//i.test(p.website) ? p.website : "";

  return (
    <div className="pd">
      <div className="pd-tags">
        <span className="pd-tag"><Icon name={c?.icon ?? "pin"} size={14} /> {c?.label ?? p.category}</span>
        {p.district && <span className="pd-tag plain">{p.district}</span>}
        {p.approx && <span className="pd-tag plain">Approximate location</span>}
      </div>

      {p.desc && <p className="pd-desc">{p.desc}</p>}
      {p.notes && <p className="pd-note">{p.notes}</p>}
      {p.visited && <p className="pd-meta">Editor visited {p.visited}</p>}

      <div className="pd-actions">
        <a className="btn primary" href={googleMapsUrl(p.lat, p.lng)} target="_blank" rel="noopener"><Icon name="directions" size={18} /> Directions</a>
        <Button variant={visited ? "secondary" : "secondary"} className={visited ? "on" : ""} icon="check" aria-pressed={visited} onClick={onToggleVisited}>
          {visited ? `Visited ${visitedOn ?? ""}`.trim() : "Mark as visited"}
        </Button>
      </div>

      {onLocate && (
        <div className="pd-dist" aria-live="polite">
          <Icon name="locate" size={22} />
          <div className="pd-dist-text">
            {distanceKm != null
              ? <><strong>{formatKm(distanceKm)}</strong> from your location<small>Straight-line distance. Roads are longer; use Directions for the route.</small></>
              : <><strong>How far is it from you?</strong><small>Uses your phone's GPS. Your position is never sent anywhere.</small></>}
          </div>
          <Button onClick={onLocate} disabled={locating}>{locating ? "Locating…" : distanceKm != null ? "Update" : "Check"}</Button>
        </div>
      )}

      <ul className="pd-info">
        {p.phone && <li><Icon name="phone" /><a href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}>{p.phone}</a></li>}
        {web && <li><Icon name="globe" /><a href={web} target="_blank" rel="noopener">{web.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")}</a></li>}
        <li><Icon name="pin" /><span className="pd-coords">{coords}</span>
          <button type="button" className="link" onClick={copy}>{copied ? "Copied" : "Copy"}</button></li>
        {apple && <li><Icon name="directions" /><a href={appleMapsUrl(p.lat, p.lng, p.name)} target="_blank" rel="noopener">Open in Apple Maps</a></li>}
      </ul>

      {admin && (
        <div className="pd-admin">
          <Button icon="edit" onClick={onEdit}>Edit</Button>
          {canDelete && <Button variant="danger" icon="trash" onClick={onDelete}>Delete</Button>}
        </div>
      )}
    </div>
  );
}
