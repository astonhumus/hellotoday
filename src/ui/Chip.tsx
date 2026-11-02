import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  count?: number;
  dotColor?: string;
  icon?: string; // an icon name from ui/icons.ts
  children: ReactNode;
}

/** A toggleable filter pill. */
export function Chip({ pressed, count, dotColor, icon, children, className = "", ...rest }: Props) {
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={pressed} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {children}
      {count != null && <span className="chip-n">{count}</span>}
    </button>
  );
}
