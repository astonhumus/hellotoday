import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: IconName;
  children?: ReactNode;
}

/** The one button. `primary` = the main action, `secondary` = default, `ghost` = quiet, `danger` = destructive. */
export function Button({ variant = "secondary", icon, children, className = "", type = "button", ...rest }: Props) {
  const cls = ["btn", variant === "primary" && "primary", variant === "danger" && "primary danger", variant === "ghost" && "ghost", className]
    .filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} size={18} />}
      {children}
    </button>
  );
}

/** A round icon-only button (needs an accessible label). */
export function IconButton({ icon, label, className = "", pressed, ...rest }: { icon: IconName; label: string; pressed?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <Icon name={icon} size={20} />
    </button>
  );
}
