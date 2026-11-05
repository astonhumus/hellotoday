import { useEffect, useState } from "react";
import { store } from "./data";

export type Theme = "system" | "light" | "dark";
const KEY = "theme";
const dark = () => matchMedia("(prefers-color-scheme: dark)");

export const getTheme = (): Theme => {
  const v = store.get(KEY);
  return v === "light" || v === "dark" ? v : "system";
};

/** What is actually shown: "system" follows the phone's own light/dark setting. */
export const resolved = (t: Theme = getTheme()): "light" | "dark" => (t === "system" ? (dark().matches ? "dark" : "light") : t);

let meta: HTMLMetaElement | null = null;

/** Applies a theme now: the tokens in styles/tokens.css switch on the data-theme attribute. */
export function applyTheme(t: Theme = getTheme()) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
  root.style.colorScheme = t === "system" ? "light dark" : t;
  // The browser's address bar colour follows the chosen theme, not just the phone's.
  if (!meta) {
    document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.remove());
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = resolved(t) === "dark" ? "#0f0f0e" : "#fafaf9";
}

export function setTheme(t: Theme) {
  store.set(KEY, t);
  applyTheme(t);
  window.dispatchEvent(new Event("themechange"));
}

/** "light" or "dark" as shown right now; re-renders when the setting (or the phone's own setting) changes. */
export function useTheme(): "light" | "dark" {
  const [now, setNow] = useState(() => resolved());
  useEffect(() => {
    const update = () => { applyTheme(); setNow(resolved()); };
    const mq = dark();
    mq.addEventListener("change", update);
    window.addEventListener("themechange", update);
    return () => { mq.removeEventListener("change", update); window.removeEventListener("themechange", update); };
  }, []);
  return now;
}
