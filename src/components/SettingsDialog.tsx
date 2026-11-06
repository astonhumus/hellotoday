import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CountryInfo, StateInfo } from "../types";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { useInstall } from "../lib/install";
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
  const inst = useInstall();
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
      <section className="set-row" aria-labelledby="set-install">
        <h3 id="set-install">Install app</h3>
        {inst.installed ? <p className="set-value">The app is installed on this device.</p> : (
          <>
            <Button icon="download" variant="primary" onClick={() => void inst.prompt()} disabled={!inst.canPrompt}>Install app</Button>
            <p className="hint">{inst.canPrompt ? "Adds the app to your home screen and works offline."
              : inst.ios ? "On iPhone or iPad: tap the Share button in Safari, then “Add to Home Screen”."
              : "Open your browser's menu and choose “Install app” or “Add to Home screen”."}</p>
          </>
        )}
      </section>
      <div className="actions">
        <Button variant="primary" onClick={() => dlg.current?.close()}>Done</Button>
      </div>
    </dialog>,
    document.body
  );
}
