import type { ReactNode } from "react";
import { Button } from "./Button";

/** Grey placeholder rows shown while data loads. `row` = a list row, `card` = a tile or card. */
export function Skeleton({ rows = 4, kind = "row", label = "Loading" }: { rows?: number; kind?: "row" | "card"; label?: string }) {
  return (
    <div className={`skel-list sk-${kind}`} role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => <span key={i} className="skel" aria-hidden="true" />)}
    </div>
  );
}

/** A whole-screen skeleton: a title block and a few rows. Used while a screen's code is loading. */
export function SkeletonPage() {
  return (
    <div className="page">
      <span className="skel skel-title" aria-hidden="true" />
      <Skeleton rows={4} kind="card" />
    </div>
  );
}

interface EmptyProps {
  title: string;
  hint?: ReactNode;
  action?: { label: string; onClick: () => void };
}

/** Nothing to show: say why in one line, and offer the one thing to do next. */
export function EmptyState({ title, hint, action }: EmptyProps) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
      {action && <Button onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}
