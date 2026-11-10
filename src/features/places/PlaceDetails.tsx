import { useState } from "react";
import type { Category, Place } from "../../types";
import { formatCoords } from "../../lib/coords";
import { appleMapsUrl, googleMapsUrl } from "../../lib/nav";
import { formatDistance } from "../../lib/prefs";
import { notify } from "../../lib/ui";
import { reportLink } from "../../components/AboutPage";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

interface Props {
  place: Place;
  category?: Category;
  visited: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  visitedOn?: string;
  onToggleVisited: () => void;
  admin: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClosure?: () => void;     // admin / contributor: close, archive or reopen
  distanceKm?: number;        // straight-line distance from the visitor's GPS position, once known
  onLocate?: () => void;      // ask for the position (or measure again)
  locating?: boolean;
}

/** Everything about one place, with the actions people actually want: directions, call, website, mark as visited. */
export function PlaceDetails({ place: p, category: c, visited, favorite, onToggleFavorite, visitedOn, onToggleVisited, admin, canDelete, onEdit, onDelete, onClosure, distanceKm, onLocate, locating }: Props) {
  const [copied, setCopied] = useState(false);
  const coords = formatCoords(p.lat, p.lng);
  const copy = () => navigator.clipboard?.writeText(coords).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const apple = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent); // the Apple Maps link only helps on Apple devices
  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name}${p.district ? `, ${p.district}` : ""}`, url });
      else { await navigator.clipboard.writeText(url); void notify("Link copied."); }
    } catch { /* the share sheet was closed */ }
  };
  const report = reportLink(`Problem with place: ${p.name} (${location.href})`);
  const web = p.website && /^https?:\/\//i.test(p.website) ? p.website : "";

  return (
    <div className="pd">
      {p.closure && (
        <div className={"pd-closed " + p.closure} role="status">
          <Icon name={p.closure === "temporary" ? "clock" : "circle-x"} size={20} />
          <div>
            <strong>{p.closure === "temporary" ? "Temporarily closed" : "Permanently closed"}</strong>
            {p.closedOn && <small> since {p.closedOn}</small>}
            {p.closureNote && <p>{p.closureNote}</p>}
            {p.closure === "permanent" && <p>Archived: visitors can't see this place. Only admins and contributors can.</p>}
          </div>
        </div>
      )}
      <div className="pd-tags">
        <span className="pd-tag"><Icon name={c?.icon ?? "pin"} size={14} /> {c?.label ?? p.category}</span>
        {p.district && <span className="pd-tag plain">{p.district}</span>}
        {p.approx && <span className="pd-tag plain">Location is approximate</span>}
      </div>

      {p.desc && <p className="pd-desc">{p.desc}</p>}
      {p.notes && <p className="pd-note">{p.notes}</p>}
      {p.visited && <p className="pd-meta">Last checked on {p.visited}</p>}

      <div className="pd-actions">
        <a className="btn primary" href={googleMapsUrl(p.lat, p.lng)} target="_blank" rel="noopener"><Icon name="directions" size={18} /> Directions</a>
        <Button className={"fav-btn" + (favorite ? " on" : "")} icon="heart" aria-pressed={favorite} aria-label={favorite ? "Remove from favourites" : "Add to favourites"} title={favorite ? "Remove from favourites" : "Add to favourites"} onClick={onToggleFavorite} />
        <Button className={visited ? "on" : ""} icon="check" aria-pressed={visited} onClick={onToggleVisited}>
          {visited ? `Visited ${visitedOn ?? ""}`.trim() : "Mark as visited"}
        </Button>
        {p.phone && <a className="btn" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={18} /> Call</a>}
        <Button icon="share" aria-label="Share this place" onClick={share}>{p.phone ? "" : "Share"}</Button>
      </div>

      {onLocate && (
        <div className="pd-dist" aria-live="polite">
          <Icon name="locate" size={22} />
          <div className="pd-dist-text">
            {distanceKm != null
              ? <><strong>{formatDistance(distanceKm)}</strong> from your location<small>Straight-line distance. Roads are longer; use Directions for the route.</small></>
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
        {report && <li><Icon name="flag" /><a href={report}>Report a problem with this place</a></li>}
        {apple && <li><Icon name="directions" /><a href={appleMapsUrl(p.lat, p.lng, p.name)} target="_blank" rel="noopener">Open in Apple Maps</a></li>}
      </ul>

      {admin && (
        <div className="pd-admin">
          <Button icon="edit" onClick={onEdit}>Edit</Button>
          {onClosure && <Button icon="clock" onClick={onClosure}>{p.closure ? "Closure / reopen" : "Close or archive"}</Button>}
          {canDelete && <Button variant="danger" icon="trash" onClick={onDelete}>Delete</Button>}
        </div>
      )}
    </div>
  );
}
