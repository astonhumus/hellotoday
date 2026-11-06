import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { store } from "../lib/data";
import { useInstall } from "../lib/install";


// A thin strip under the header: new-version notice, offline notice, and an "Install app" offer.
export function PwaBar({ showInstall = true }: { showInstall?: boolean }) {
  const [online, setOnline] = useState(navigator.onLine);
  const inst = useInstall();
  const [dismissed, setDismissed] = useState(() => store.get("install-dismissed") === "1");

  // A new version waits until the person taps Reload, so a page is never swapped out from under them.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000); }
  });

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => { removeEventListener("online", on); removeEventListener("offline", off); };
  }, []);

  const dismiss = () => { store.set("install-dismissed", "1"); setDismissed(true); };

  return (
    <>
      {needRefresh && (
        <div className="bar update" role="status">
          <span>A new version is ready.</span>
          <button className="btn primary" onClick={() => void updateServiceWorker(true)}>Reload</button>
        </div>
      )}
      {!online && <div className="bar offline" role="status">You're offline. Showing saved data; editing resumes when you're back online.</div>}
      {showInstall && online && !dismissed && !inst.installed && (inst.canPrompt || inst.ios) && (
        <div className="bar install" role="status">
          <span>{inst.canPrompt ? "Install this app for quick access and offline use." : "Install: tap the Share button, then “Add to Home Screen”."}</span>
          {inst.canPrompt && <button className="btn primary" onClick={() => void inst.prompt()}>Install</button>}
          <button className="link" onClick={dismiss} aria-label="Dismiss">Not now</button>
        </div>
      )}
    </>
  );
}
