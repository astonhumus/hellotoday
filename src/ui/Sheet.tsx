import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];

interface Props {
  snap: Snap;
  onSnap: (s: Snap) => void;
  head: ReactNode;                 // always visible: the title row next to the drag handle
  children: ReactNode;             // scrolls; hidden while the sheet is peeking
  peek?: number;                   // height in px when peeking
  topGap?: number;                 // space left above the sheet when fully open (for overlaid controls)
  onHeight?: (px: number) => void; // lets the map keep the pin in the visible area
  label: string;
}

/**
 * A bottom sheet that sits over the map and snaps to three heights (peek / half / full), like Google Maps.
 * Drag the handle or title row, or use the arrow button (keyboard friendly).
 * While dragging, the height is written straight to the element so React does not re-render the page on every
 * pointer move; React state changes once when the drag starts and once when it ends.
 */
export function Sheet({ snap, onSnap, head, children, peek = 84, topGap = 124, onHeight, label }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [parentH, setParentH] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ y: number; h: number; moved: boolean } | null>(null);
  const live = useRef(0); // the height while dragging

  // Measured before the first paint, so the sheet never flashes at zero height.
  useLayoutEffect(() => {
    const parent = root.current?.parentElement;
    if (!parent) return;
    const ro = new ResizeObserver(() => setParentH(parent.clientHeight));
    ro.observe(parent);
    setParentH(parent.clientHeight);
    return () => ro.disconnect();
  }, []);

  const heights: Record<Snap, number> = { peek, half: Math.round(parentH * 0.5), full: Math.max(peek, parentH - topGap) };
  const height = heights[snap];
  useEffect(() => { onHeight?.(height); }, [height]); // eslint-disable-line react-hooks/exhaustive-deps

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    start.current = { y: e.clientY, h: heights[snap], moved: false };
    live.current = heights[snap];
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (!s.moved && Math.abs(s.y - e.clientY) > 6) { s.moved = true; setDragging(true); }
    if (s.moved && root.current) {
      live.current = Math.min(heights.full, Math.max(peek, s.h + (s.y - e.clientY)));
      root.current.style.height = `${live.current}px`;
    }
  };
  const up = () => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (!s.moved) return onSnap(ORDER[(ORDER.indexOf(snap) + 1) % ORDER.length]); // a tap steps to the next height
    const h = live.current;
    const target = ORDER.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
    setDragging(false);
    if (root.current) root.current.style.height = `${heights[target]}px`; // keeps the DOM and React's value in agreement
    onSnap(target);
  };

  const open = snap !== "peek" || dragging;
  return (
    <div ref={root} className={"sheet" + (dragging ? " dragging" : "")} style={{ height }} role="region" aria-label={label}>
      <div className="sheet-head" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-title">{head}</div>
        <button type="button" className="icon-btn" aria-label={snap === "full" ? "Lower the panel" : "Raise the panel"}
          aria-expanded={snap !== "peek"} onClick={() => onSnap(snap === "full" ? "half" : snap === "half" ? "full" : "half")}>
          <Icon name={snap === "full" ? "chevron-down" : "chevron-up"} />
        </button>
      </div>
      <div className="sheet-body" style={{ visibility: open ? "visible" : "hidden" }}>{children}</div>
    </div>
  );
}
