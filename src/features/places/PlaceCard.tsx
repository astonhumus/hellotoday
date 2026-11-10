import { useEffect, useRef } from "react";
import type { Category, Place } from "../../types";
import { Icon } from "../../ui/Icon";
import { formatDistance } from "../../lib/prefs";

interface Props {
  place: Place;
  category?: Category;
  active: boolean;
  visited: boolean;
  favorite: boolean;
  distanceKm?: number;
  region?: string;            // shown after the category when places from several regions are listed together
  onOpen: () => void;
  onToggleVisited: () => void;
  onToggleFavorite: () => void;
}

/** One row in the list: category badge, name, where, a short description, and a quick "visited" tick. */
export function PlaceCard({ place: p, category: c, active, visited, favorite, distanceKm, region, onOpen, onToggleVisited, onToggleFavorite }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  // Tapping a pin on the map brings its row into view in the list.
  useEffect(() => { if (active) ref.current?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }, [active]);
  return (
    <li ref={ref} className={"pc" + (active ? " active" : "")}>
      <button type="button" className="pc-main" onClick={onOpen} aria-label={`${p.name}. Open details`}>
        <span className="pc-icon" aria-hidden="true"><Icon name={c?.icon ?? "pin"} size={22} /></span>
        <span className="pc-text">
          <span className="pc-name">{p.name}</span>
          <span className="pc-meta">{c?.label ?? p.category}{p.district ? ` · ${p.district}` : ""}{region ? ` · ${region}` : ""}{p.approx ? " · approx." : ""}{distanceKm != null ? ` · ${formatDistance(distanceKm)} away` : ""}</span>
          {p.desc && <span className="pc-desc">{p.desc}</span>}
          {p.closure && (
            <span className={"badge closed " + p.closure}><Icon name={p.closure === "temporary" ? "clock" : "circle-x"} size={14} /> {p.closure === "temporary" ? "Temporarily closed" : "Archived: permanently closed"}</span>
          )}
          {p.status && p.status !== "approved" && (
            <span className={"badge " + p.status}><Icon name={p.status === "pending" ? "clock" : "circle-x"} size={14} /> {p.status === "pending" ? "Waiting for approval" : `Rejected${p.reviewNote ? ": " + p.reviewNote : ""}`}</span>
          )}
        </span>
      </button>
      <button type="button" className={"pc-fav" + (favorite ? " on" : "")} aria-pressed={favorite}
        aria-label={favorite ? `Remove ${p.name} from favourites` : `Add ${p.name} to favourites`} onClick={onToggleFavorite}>
        <Icon name="heart" size={20} />
      </button>
      <button type="button" className={"pc-check" + (visited ? " on" : "")} aria-pressed={visited}
        aria-label={visited ? `Unmark ${p.name} as visited` : `Mark ${p.name} as visited`} onClick={onToggleVisited}>
        <Icon name="check" size={18} />
      </button>
    </li>
  );
}
