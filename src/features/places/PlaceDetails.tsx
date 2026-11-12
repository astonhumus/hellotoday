import { useState } from "react";
import type { Category, Place } from "../../types";
import { formatCoords } from "../../lib/coords";
import { appleMapsUrl, googleDirectionsUrl } from "../../lib/nav";
import { formatDistance } from "../../lib/prefs";
import { formatDate, safeHttps } from "../../lib/format";
import { notify } from "../../lib/ui";
import { canSuggest, openSuggest } from "../../lib/suggest";
import { reportLink } from "../../components/AboutPage";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";

interface Props {
  place: Place;
  category?: Category;
  shareUrl: string;           // the address that opens this place (with its region), so a shared link works for anyone
  visited: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  inTrip: boolean;
  onToggleTrip: () => void;
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
export function PlaceDetails({ place: p, category: c, shareUrl, visited, favorite, onToggleFavorite, inTrip, onToggleTrip, visitedOn, onToggleVisited, admin, canDelete, onEdit, onDelete, onClosure, distanceKm, onLocate, locating }: Props) {
  const [copied, setCopied] = useState(false);
  const [brokenPhoto, setBrokenPhoto] = useState(false);
  const coords = formatCoords(p.lat, p.lng);
  const copy = () => navigator.clipboard?.writeText(coords).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const apple = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent); // the Apple Maps link only helps on Apple devices
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name}${p.district ? `, ${p.district}` : ""}`, url: shareUrl });
      else { await navigator.clipboard.writeText(shareUrl); void notify("Link copied."); }
    } catch { /* the share sheet was closed */ }
  };
  const report = canSuggest ? "" : reportLink(`Problem with place: ${p.name} (${shareUrl})`);
  const web = p.website && /^https?:\/\//i.test(p.website) ? p.website : "";
  const photo = safeHttps(p.photo);
  const facts = [
    { icon: "hours", label: "Hours", text: p.hours },
    { icon: "ticket", label: "Entry / price", text: p.fee },
    { icon: "calendar", label: "Best time to visit", text: p.season }
  ].filter(f => f.text);

  return (
    <div className="pd">
      {photo && !brokenPhoto && (
        <img className="pd-photo" src={photo} alt={`${p.name}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBrokenPhoto(true)} />
      )}
      {p.closure && (
        <div className={"pd-closed " + p.closure} role="status">
          <Icon name={p.closure === "temporary" ? "clock" : "circle-x"} size={20} />
          <div>
            <strong>{p.closure === "temporary" ? "Temporarily closed" : "Permanently closed"}</strong>
            {p.closedOn && <small> since {formatDate(p.closedOn)}</small>}
            {p.closureNote && <p>{p.closureNote}</p>}
            {p.closure === "permanent" && <p>Archived: visitors can't see this place. Only admins and contributors can.</p>}
          </div>
        </div>
      )}
      <div className="pd-tags">
        <span className="pd-tag" style={c?.color ? { "--cat": c.color } as React.CSSProperties : undefined}><Icon name={c?.icon ?? "pin"} size={14} /> {c?.label ?? p.category}</span>
        {p.district && <span className="pd-tag plain">{p.district}</span>}
        {p.approx && <span className="pd-tag plain">Location is approximate</span>}
      </div>

      {p.desc && <p className="pd-desc">{p.desc}</p>}
      {p.notes && <p className="pd-note">{p.notes}</p>}
      {facts.length > 0 && (
        <dl className="pd-facts">
          {facts.map(f => (
            <div key={f.label}><dt><Icon name={f.icon} size={16} /> {f.label}</dt><dd>{f.text}</dd></div>
          ))}
        </dl>
      )}
      {p.visited && <p className="pd-meta">Last checked on {formatDate(p.visited)}</p>}

      <div className="pd-actions">
        <a className="btn primary pd-go" href={googleDirectionsUrl(p.lat, p.lng)} target="_blank" rel="noopener"><Icon name="directions" size={18} /> Directions</a>
        <div className="pd-row">
          <Button className={visited ? "on" : ""} icon="check" aria-pressed={visited} onClick={onToggleVisited}>
            {visited ? `Visited${visitedOn ? ` ${formatDate(visitedOn)}` : ""}` : "Mark as visited"}
          </Button>
          <Button className={"fav-btn" + (favorite ? " on" : "")} icon="heart" aria-pressed={favorite} aria-label={favorite ? "Remove from favourites" : "Add to favourites"} title={favorite ? "Remove from favourites" : "Add to favourites"} onClick={onToggleFavorite}>Save</Button>
          <Button className={inTrip ? "on" : ""} icon="route" aria-pressed={inTrip} onClick={onToggleTrip}>{inTrip ? "In my trip" : "Add to trip"}</Button>
          {p.phone && <a className="btn" href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}><Icon name="phone" size={18} /> Call</a>}
          <Button icon="share" onClick={share}>Share</Button>
        </div>
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
        {canSuggest && <li><Icon name="flag" /><button type="button" className="link pd-report" onClick={() => openSuggest({ kind: "problem", about: p.name, link: shareUrl })}>Report a problem or suggest a correction</button></li>}
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
