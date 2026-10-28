import type { ButtonHTMLAttributes, ReactNode } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  count?: number;
  dotColor?: string;
  children: ReactNode;
}

/** A toggleable filter pill. */
export function Chip({ pressed, count, dotColor, children, className = "", ...rest }: Props) {
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={pressed} {...rest}>
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {children}
      {count != null && <span className="chip-n">{count}</span>}
    </button>
  );
}
