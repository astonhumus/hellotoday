import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type Snap = "peek" | "half" | "full";
const ORDER: Snap[] = ["peek", "half", "full"];
const SLOP = 6;     // px a finger may wander before a touch counts as a drag
const FLICK = 0.35; // px per ms: faster than this, the sheet goes to the next height in that direction, however short the swipe

interface Props {
  snap: Snap;
  onSnap: (s: Snap) => void;
  head: ReactNode;                 // always visible: the title row next to the drag handle
  children: ReactNode;             // scrolls; hidden while the sheet is peeking
  peek?: number;                   // height in px when peeking
  topGap?: number;                 // space left above the sheet when fully open (for overlaid controls)
  onHeight?: (px: number) => void; // lets the map keep the pin in the visible area
  label: string;
  openLabel?: string;              // the button's text while the sheet is down, e.g. "List"
  closeLabel?: string;             // the button's text while the sheet is up, e.g. "Map"
}

/**
 * A bottom sheet that sits over the map and snaps to three heights (peek / half / full), like Google Maps.
 *
 * How it is moved:
 * - the labelled button opens it (peek -> half) or puts it away (half / full -> peek);
 * - tapping the title row does the same, except that a fully open sheet steps down to half;
 * - dragging works from anywhere on the sheet, not only the handle. While it is not fully open, dragging the content moves
 *   the sheet; once fully open the content scrolls, and pulling down from the top of the content lowers the sheet again;
 * - a quick flick goes to the next height in that direction, a slow drag settles on the nearest one.
 *
 * While dragging, the height is written straight to the element so React does not re-render the page on every
 * pointer move; React state changes once when the drag starts and once when it ends.
 */
export function Sheet({ snap, onSnap, head, children, peek = 84, topGap = 124, onHeight, label, openLabel = "List", closeLabel = "Map" }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [parentH, setParentH] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; h: number; moved: boolean; lastY: number; lastT: number; v: number } | null>(null);
  const live = useRef(0);            // the height while dragging
  const swallowClick = useRef(false); // a drag that started on a list row must not also open that row

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
  // Put away: the next time it opens, the content starts from the top.
  useEffect(() => { if (snap === "peek" && body.current) body.current.scrollTop = 0; }, [snap]);

  const begin = (y: number) => {
    drag.current = { y, h: heights[snap], moved: false, lastY: y, lastT: performance.now(), v: 0 };
    live.current = heights[snap];
  };
  /** Follows the finger. Returns true once the touch has become a drag. */
  const dragTo = (y: number) => {
    const s = drag.current;
    if (!s) return false;
    const now = performance.now();
    if (now > s.lastT) s.v = 0.7 * ((s.lastY - y) / (now - s.lastT)) + 0.3 * s.v; // upwards is positive
    s.lastY = y; s.lastT = now;
    if (!s.moved && Math.abs(s.y - y) > SLOP) { s.moved = true; setDragging(true); }
    if (s.moved && root.current) {
      live.current = Math.min(heights.full, Math.max(peek, s.h + (s.y - y)));
      root.current.style.height = `${live.current}px`;
    }
    return s.moved;
  };
  const end = (tapToggles: boolean) => {
    const s = drag.current;
    drag.current = null;
    if (!s) return;
    if (!s.moved) { if (tapToggles) onSnap(snap === "peek" ? "half" : snap === "full" ? "half" : "peek"); return; }
    const h = live.current;
    const v = performance.now() - s.lastT > 120 ? 0 : s.v; // held still before letting go: not a flick
    let target = ORDER.reduce((a, b) => (Math.abs(heights[b] - h) < Math.abs(heights[a] - h) ? b : a));
    if (Math.abs(v) > FLICK) {
      const up = v > 0;
      const next = ORDER.filter(k => (up ? heights[k] > h + 1 : heights[k] < h - 1)).sort((a, b) => (up ? heights[a] - heights[b] : heights[b] - heights[a]))[0];
      target = next ?? (up ? "full" : "peek");
    }
    setDragging(false);
    if (root.current) root.current.style.height = `${heights[target]}px`; // keeps the DOM and React's value in agreement
    onSnap(target);
  };
  // The touch listeners below are attached once per height, so they call the latest versions through this.
  const api = useRef({ begin, dragTo, end });
  api.current = { begin, dragTo, end };

  // ── the title row: drag, or tap to open / put away ──
  const headDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button, a, input, select")) return;
    begin(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // ── the content, while the sheet is not fully open: dragging it moves the sheet (rows are still tappable) ──
  const bodyDown = (e: React.PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false;
    if (snap === "full" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("input, select, textarea")) return;
    begin(e.clientY);
  };
  const bodyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || snap === "full") return;
    if (dragTo(e.clientY) && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      swallowClick.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const bodyUp = () => { if (snap !== "full") end(false); };

  // ── the content, fully open: it scrolls; pulling down while at the top lowers the sheet instead ──
  useEffect(() => {
    const el = body.current;
    if (!el || snap !== "full") return;
    let mode: "idle" | "drag" | "scroll" = "idle", y0 = 0, top = 0;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { mode = "scroll"; return; }
      mode = "idle"; y0 = e.touches[0].clientY; top = el.scrollTop;
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      if (mode === "idle") {
        if (y === y0) return;
        if (y > y0 && top <= 0 && el.scrollTop <= 0) { mode = "drag"; api.current.begin(y0); }
        else { mode = "scroll"; return; }
      }
      if (mode !== "drag") return;
      if (e.cancelable) e.preventDefault(); // the page must not scroll or pull-to-refresh under the finger
      if (api.current.dragTo(y)) swallowClick.current = true;
    };
    const onEnd = () => { if (mode === "drag") api.current.end(false); mode = "idle"; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [snap]);

  const up = snap !== "peek";
  const open = up || dragging;
  return (
    <div ref={root} className={"sheet" + (dragging ? " dragging" : "") + (up ? " up" : "")} style={{ height }} role="region" aria-label={label}>
      <div className="sheet-head" onPointerDown={headDown} onPointerMove={e => { dragTo(e.clientY); }} onPointerUp={() => end(true)} onPointerCancel={() => end(false)}>
        <span className="sheet-grip" aria-hidden="true" />
        <div className="sheet-title">{head}</div>
        <button type="button" className="sheet-toggle" aria-expanded={up} onClick={() => onSnap(up ? "peek" : "half")}>
          {up ? closeLabel : openLabel}<Icon name={up ? "chevron-down" : "chevron-up"} size={18} />
        </button>
      </div>
      <div ref={body} className="sheet-body" style={{ visibility: open ? "visible" : "hidden", touchAction: snap === "full" ? "pan-y" : "none" }}
        onPointerDown={bodyDown} onPointerMove={bodyMove} onPointerUp={bodyUp} onPointerCancel={bodyUp}
        onClickCapture={e => { if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation(); } }}>
        {children}
      </div>
    </div>
  );
}
