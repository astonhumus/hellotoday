import type { ReactNode } from "react";
import { IconButton } from "./Button";

interface Props {
  title: string;       // the page's one H1
  sub?: ReactNode;     // a short line under it
  actions?: ReactNode; // buttons on the right (e.g. admin "Add")
  onBack?: () => void; // shows a Back button before the title (for pages that are not in the menu)
}

/** The title block at the top of a screen. Not a <header>, so it never picks up the site header's styling. */
export function PageHeader({ title, sub, actions, onBack }: Props) {
  return (
    <div className="ph">
      {onBack && <IconButton className="ph-back" icon="back" label="Back" onClick={onBack} />}
      <div className="ph-text">
        <h1>{title}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </div>
  );
}
