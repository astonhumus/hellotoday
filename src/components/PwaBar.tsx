import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { store } from "../lib/data";
import { useInstall } from "../lib/install";
import { confirmAsk } from "../lib/ui";

let updateTimer: number | undefined; // one hourly update check, however often the bar remounts


// A thin strip under the header: new-version notice, offline notice, and an "Install app" offer.
export function PwaBar({ showInstall = true }: { showInstall?: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const inst = useInstall();
  const [dismissed, setDismissed] = useState(() => store.get("install-dismissed") === "1");

  // A new version waits until the person taps Reload, so a page is never swapped out from under them.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg && updateTimer === undefined) updateTimer = window.setInterval(() => void reg.update(), 60 * 60 * 1000); }
  });

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  // Offer the install only after the person has used the app a little (a tap, a scroll, or 20 seconds), not on arrival.
  const [engaged, setEngaged] = useState(false);
  useEffect(() => {
    const on = () => setEngaged(true);
    const t = window.setTimeout(on, 20000);
    addEventListener("pointerdown", on, { once: true });
    addEventListener("scroll", on, { once: true, capture: true });
    return () => { clearTimeout(t); removeEventListener("pointerdown", on); removeEventListener("scroll", on, { capture: true }); };
  }, []);

  const dismiss = () => { store.set("install-dismissed", "1"); setDismissed(true); };

  return (
    <>
      {needRefresh && (
        <div className="bar update" role="status">
          <span>A new version is ready.</span>
          <button className="btn primary" onClick={async () => {
            // Reloading throws away anything typed into an open form.
            if (document.querySelector("dialog[open]") && !(await confirmAsk("Reloading will discard what you are typing. Reload anyway?", { yes: "Reload", danger: true }))) return;
            void updateServiceWorker(true);
          }}>Reload</button>
        </div>
      )}
      {!online && <div className="bar offline" role="status">You're offline. Showing saved data; editing resumes when you're back online.</div>}
      {showInstall && engaged && online && !dismissed && !inst.installed && (inst.canPrompt || inst.ios) && (
        <div className="bar install" role="status">
          <span>{inst.canPrompt ? "Install this app for quick access and offline use." : "Install: tap the Share button, then “Add to Home Screen”."}</span>
          {inst.canPrompt && <button className="btn primary" onClick={() => void inst.prompt()}>Install</button>}
          <button className="link" onClick={dismiss} aria-label="Dismiss">Not now</button>
        </div>
      )}
    </>
  );
}
