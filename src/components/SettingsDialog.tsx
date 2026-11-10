import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CountryInfo, StateInfo } from "../types";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { useInstall } from "../lib/install";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { usePrefs, setUnits, setTextSize, type Units, type TextSize } from "../lib/prefs";
import { clearFavorites } from "../lib/favorites";
import { confirmAsk } from "../lib/ui";
import { go } from "../lib/nav";

interface Props {
  country?: CountryInfo;
  state?: StateInfo;
  onChangeRegion: () => void;
  onClose: () => void;
  review?: { pending: number }; // admins only: a way to the review page
}

const THEMES: { id: Theme; label: string }[] = [{ id: "system", label: "Auto" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];

/** App settings: the colour theme, and a shortcut to the country and state/province setting. */
export function SettingsDialog({ country, state, onChangeRegion, onClose, review }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const inst = useInstall();
  const prefs = usePrefs();
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
      <section className="set-row" aria-labelledby="set-text">
        <h3 id="set-text">Text size</h3>
        <Segmented<TextSize> label="Text size" value={prefs.text} onChange={setTextSize}
          options={[{ id: "normal", label: "Normal" }, { id: "large", label: "Large" }, { id: "xlarge", label: "Extra large" }]} />
      </section>
      <section className="set-row" aria-labelledby="set-units">
        <h3 id="set-units">Distance</h3>
        <Segmented<Units> label="Distance units" value={prefs.units} onChange={setUnits} options={[{ id: "km", label: "Kilometres" }, { id: "mi", label: "Miles" }]} />
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
      {review && (
        <section className="set-row" aria-labelledby="set-admin">
          <h3 id="set-admin">Admin</h3>
          <Button onClick={() => { dlg.current?.close(); go("#/review"); }}>Review submissions{review.pending ? ` (${review.pending})` : ""}</Button>
        </section>
      )}
      <section className="set-row" aria-labelledby="set-data">
        <h3 id="set-data">Saved on this device</h3>
        <p className="hint">Favourites, visited places, your checklist and recent searches never leave this browser.</p>
        <Button variant="danger" icon="trash" onClick={async () => {
          if (!(await confirmAsk("Delete your favourites, visited places and checklist from this device?", { yes: "Delete", danger: true }))) return;
          clearFavorites();
          try {
            // Also the remembered searches. Settings (theme, text size, units, region) are kept.
            Object.keys(localStorage).filter(k => k === "my-visited" || k === "checklist" || k === "seen-rejected" || k.startsWith("recent:")).forEach(k => localStorage.removeItem(k));
          } catch { /* ignore */ }
          location.reload(); // screens still hold the old lists in memory and would write them straight back
        }}>Clear saved data</Button>
      </section>
      <div className="actions">
        <Button variant="primary" onClick={() => dlg.current?.close()}>Done</Button>
      </div>
    </dialog>,
    document.body
  );
}
