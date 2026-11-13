import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";

export interface MenuItem {
  label: string;
  icon?: IconName;
  onClick?: () => void;
  href?: string;     // a link instead of an action (e.g. a mailto:)
  danger?: boolean;
}

/**
 * A "⋯" button that opens a short list of less-used actions (edit, delete, report).
 * The list is fixed to the screen, so a card with `overflow: hidden` never clips it. It closes on a choice, a tap elsewhere,
 * Escape, scrolling or resizing.
 */
export function Menu({ items, label, className = "" }: { items: MenuItem[]; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = r.bottom + 8 + 48 * items.length > innerHeight && r.top > innerHeight / 2; // near the bottom: open upwards
    // Opens toward the side with room: from a button on the left half it grows rightwards, otherwise leftwards.
    const side = r.left + r.width / 2 < innerWidth / 2 ? { left: Math.max(8, r.left) } : { right: Math.max(8, innerWidth - r.right) };
    setPos({ top: up ? r.top - 4 : r.bottom + 4, ...side, up });
  }, [open, items.length]);

  // Once drawn, the list knows its width: keep it fully on screen (narrow phones, large text)
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || !pos) return;
    const r = el.getBoundingClientRect(), m = 8;
    if (r.left < m || r.right > innerWidth - m) {
      const left = Math.max(m, Math.min(r.left, innerWidth - m - r.width));
      el.style.left = `${left}px`; el.style.right = "auto";
    }
  }, [pos]);

  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const close = () => setOpen(false);
    const away = (e: Event) => { if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); btn.current?.focus(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const all = [...(list.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
      const i = all.indexOf(document.activeElement as HTMLElement);
      all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    addEventListener("scroll", close, true);
    addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key);
      removeEventListener("scroll", close, true); removeEventListener("resize", close);
    };
  }, [open]);

  const pick = (it: MenuItem) => { setOpen(false); it.onClick?.(); };
  return (
    <>
      <button ref={btn} type="button" className={`icon-btn ${className}`} aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => setOpen(v => !v)}>
        <Icon name="more" size={20} />
      </button>
      {open && pos && (
        <div ref={list} id={id} role="menu" className={"menu" + (pos.up ? " up" : "")} style={{ top: pos.top, left: pos.left, right: pos.right }}>
          {items.map(it => it.href
            ? <a key={it.label} role="menuitem" className={"menu-item" + (it.danger ? " danger" : "")} href={it.href} onClick={() => setOpen(false)}>{it.icon && <Icon name={it.icon} size={18} />}{it.label}</a>
            : <button key={it.label} type="button" role="menuitem" className={"menu-item" + (it.danger ? " danger" : "")} onClick={() => pick(it)}>{it.icon && <Icon name={it.icon} size={18} />}{it.label}</button>)}
        </div>
      )}
    </>
  );
}
