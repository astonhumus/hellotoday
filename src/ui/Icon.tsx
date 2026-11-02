import { createElement } from "react";
import { iconNode, type IconName } from "./icons";

export type { IconName };

/** One icon from the app's single icon set. `name` is a key from icons.ts (data files may pass any string; unknown ones show a pin). */
export function Icon({ name, size = 20 }: { name: IconName | (string & {}); size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {iconNode(name).map(([tag, attrs], i) => createElement(tag, { ...attrs, key: i }))}
    </svg>
  );
}
