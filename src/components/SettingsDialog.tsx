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
import { kindName } from "../lib/format";
import { exportSaved, importSaved } from "../lib/backup";
import { notify } from "../lib/ui";

interface Props {
  country?: CountryInfo;
  state?: StateInfo;
  onChangeRegion: () => void;
  onClose: () => void;
  review?: { pending: number }; // admins only: a way to the review page
  account?: { approved: boolean; onSignOut: () => void }; // set only while someone is signed in
}

const THEMES: { id: Theme; label: string }[] = [{ id: "system", label: "Auto" }, { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];

/** App settings: the colour theme, and a shortcut to the country and state/province setting. */
export function SettingsDialog({ country, state, onChangeRegion, onClose, review, account }: Props) {
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
        <Segmented label="Theme" value={theme} options={THEMES} onChange={next => { setThemeState(next); setTheme(next); }} />
        <p className="hint">Auto follows your phone's light or dark setting.</p>
      </section>
      <section className="set-row" aria-labelledby="set-text">
        <h3 id="set-text">Text size</h3>
        <Segmented<TextSize> label="Text size" value={prefs.text} onChange={setTextSize}
          options={[{ id: "normal", label: "Normal" }, { id: "large", label: "Large" }, { id: "xlarge", label: "Extra large" }]} />
        <p className="hint">This adds to your phone's own text size setting.</p>
      </section>
      <section className="set-row" aria-labelledby="set-units">
        <h3 id="set-units">Distance</h3>
        <Segmented<Units> label="Distance units" value={prefs.units} onChange={setUnits} options={[{ id: "km", label: "Kilometres" }, { id: "mi", label: "Miles" }]} />
      </section>
      <section className="set-row" aria-labelledby="set-region">
        <h3 id="set-region">Region</h3>
        <p className="set-value">{state?.name ?? "…"}{country ? `, ${country.name}` : ""}</p>
        <Button onClick={() => { dlg.current?.close(); onChangeRegion(); }}>Change country or {kindName(country?.kind).toLowerCase()}</Button>
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
      <section className="set-row" aria-labelledby="set-offline">
        <h3 id="set-offline">Offline</h3>
        <p className="hint">After your first visit the places, songs and checklist work without internet. For the map pictures, open the layers button on the map and choose “Save this view” while you are online.</p>
      </section>
      <section className="set-row" aria-labelledby="set-data">
        <h3 id="set-data">Saved on this device</h3>
        <p className="hint">Favourites, visited places, your trip, your checklist and recent searches never leave this browser. Make a backup file to move them to another phone or keep a copy.</p>
        <div className="set-pair">
          <Button icon="download" onClick={exportSaved}>Back up my saved data</Button>
          <label className="btn file">Restore from a file
            <input type="file" accept=".json,application/json" hidden onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = "";
              if (!f) return;
              const n = await importSaved(f);
              if (n === null) return;
              void notify(`Restored ${n} saved ${n === 1 ? "item" : "items"}. Reloading…`);
              setTimeout(() => location.reload(), 1200); // screens still hold the old lists in memory
            }} />
          </label>
        </div>
        <Button variant="danger" icon="trash" onClick={async () => {
          if (!(await confirmAsk("Delete your favourites, visited places, trip and checklist from this device?", { yes: "Delete", danger: true }))) return;
          clearFavorites();
          try {
            // Also the remembered searches. Settings (theme, text size, units, region) are kept.
            Object.keys(localStorage).filter(k => k === "my-visited" || k === "checklist" || k === "checklist-mode" || k === "trip-places" || k === "seen-rejected" || k.startsWith("recent:")).forEach(k => localStorage.removeItem(k));
          } catch { /* ignore */ }
          location.reload(); // screens still hold the old lists in memory and would write them straight back
        }}>Clear saved data</Button>
      </section>
      {account && (
        <section className="set-row" aria-labelledby="set-account">
          <h3 id="set-account">Account</h3>
          <p className="set-value">{account.approved ? "You are signed in." : "You are signed in, but this account isn't approved yet."}</p>
          <Button onClick={() => { dlg.current?.close(); account.onSignOut(); }}>Sign out</Button>
        </section>
      )}
      <div className="actions">
        <Button variant="primary" onClick={() => dlg.current?.close()}>Done</Button>
      </div>
    </dialog>,
    document.body
  );
}
