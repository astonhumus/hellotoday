import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
  count?: number;
  dotColor?: string;
  icon?: string; // an icon name from ui/icons.ts
  iconColor?: string; // tint for the icon (a category's colour)
  children: ReactNode;
}

/** A toggleable filter pill. */
export function Chip({ pressed, count, dotColor, icon, iconColor, children, className = "", ...rest }: Props) {
  return (
    <button type="button" className={`chip ${className}`} aria-pressed={pressed} {...rest}>
      {icon && (iconColor ? <span className="chip-ic" style={{ color: iconColor }}><Icon name={icon} size={16} /></span> : <Icon name={icon} size={16} />)}
      {dotColor && <span className="dot" style={{ background: dotColor }} />}
      {children}
      {count != null && <span className="chip-n">{count}</span>}
    </button>
  );
}
