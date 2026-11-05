import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CountryInfo, StateInfo } from "../types";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";

interface Props {
  country?: CountryInfo;
  state?: StateInfo;
  onChangeRegion: () => void;
  onClose: () => void;
}

const THEMES: { id: Theme; label: string }[] = [{ id: "system", label: "Auto" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];

/** App settings: the colour theme, and a shortcut to the country and state/province setting. */
export function SettingsDialog({ country, state, onChangeRegion, onClose }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);
  useEffect(() => { dlg.current?.showModal(); }, []);

  return createPortal(
    <dialog ref={dlg} className="settings" onClose={onClose}>
      <h2>Settings</h2>
      <section className="set-row" aria-labelledby="set-theme">
        <h3 id="set-theme">Theme</h3>
        <Segmented label="Theme" value={theme} options={THEMES} onChange={t => { setThemeState(t); setTheme(t); }} />
        <p className="hint">Auto follows your phone's light or dark setting.</p>
      </section>
      <section className="set-row" aria-labelledby="set-region">
        <h3 id="set-region">Region</h3>
        <p className="set-value">{state?.name ?? "…"}{country ? `, ${country.name}` : ""}</p>
        <Button onClick={() => { dlg.current?.close(); onChangeRegion(); }}>Change country or {country?.kind.toLowerCase() ?? "state"}</Button>
      </section>
      <div className="actions">
        <Button variant="primary" onClick={() => dlg.current?.close()}>Done</Button>
      </div>
    </dialog>,
    document.body
  );
}
