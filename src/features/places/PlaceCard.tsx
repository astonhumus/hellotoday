import type { Category, Place } from "../../types";
import { Icon } from "../../ui/Icon";

interface Props {
  place: Place;
  category?: Category;
  active: boolean;
  visited: boolean;
  distanceKm?: number;
  onOpen: () => void;
  onToggleVisited: () => void;
}

/** One row in the list: category badge, name, where, a short description, and a quick "visited" tick. */
export function PlaceCard({ place: p, category: c, active, visited, distanceKm, onOpen, onToggleVisited }: Props) {
  const color = c?.color ?? "#64748b";
  return (
    <li className={"pc" + (active ? " active" : "")}>
      <button type="button" className="pc-main" onClick={onOpen} aria-label={`${p.name}. Open details`}>
        <span className="pc-icon" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }} aria-hidden="true">{c?.icon ?? "📍"}</span>
        <span className="pc-text">
          <span className="pc-name">{p.name}</span>
          <span className="pc-meta">{c?.label ?? p.category}{p.district ? ` · ${p.district}` : ""}{p.approx ? " · approx." : ""}{distanceKm != null ? ` · ${distanceKm < 10 ? distanceKm.toFixed(1) : Math.round(distanceKm)} km away` : ""}</span>
          {p.desc && <span className="pc-desc">{p.desc}</span>}
          {p.status && p.status !== "approved" && (
            <span className={"badge " + p.status}>{p.status === "pending" ? "⏳ Waiting for approval" : `✖ Rejected${p.reviewNote ? ": " + p.reviewNote : ""}`}</span>
          )}
        </span>
      </button>
      <button type="button" className={"pc-check" + (visited ? " on" : "")} aria-pressed={visited}
        aria-label={visited ? `Unmark ${p.name} as visited` : `Mark ${p.name} as visited`} onClick={onToggleVisited}>
        <Icon name="check" size={18} />
      </button>
    </li>
  );
}
