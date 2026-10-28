import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { store } from "../lib/data";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// A thin strip under the header: new-version notice, offline notice, and an "Install app" offer.
export function PwaBar() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => store.get("install-dismissed") === "1");

  // A new version waits until the person taps Reload, so a page is never swapped out from under them.
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000); }
  });

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    const before = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    const installed = () => setInstallEvent(null);
    addEventListener("online", on);
    addEventListener("offline", off);
    addEventListener("beforeinstallprompt", before);
    addEventListener("appinstalled", installed);
    return () => {
      removeEventListener("online", on); removeEventListener("offline", off);
      removeEventListener("beforeinstallprompt", before); removeEventListener("appinstalled", installed);
    };
  }, []);

  const dismiss = () => { store.set("install-dismissed", "1"); setDismissed(true); };
  const install = async () => { await installEvent?.prompt(); setInstallEvent(null); };

  return (
    <>
      {needRefresh && (
        <div className="bar update" role="status">
          <span>A new version is ready.</span>
          <button className="btn primary" onClick={() => void updateServiceWorker(true)}>Reload</button>
        </div>
      )}
      {!online && <div className="bar offline" role="status">You're offline. Showing saved data; editing resumes when you're back online.</div>}
      {online && !dismissed && !standalone() && (installEvent || isIos()) && (
        <div className="bar install" role="status">
          <span>{installEvent ? "Install this app for quick access and offline use." : "Install: tap the Share button, then “Add to Home Screen”."}</span>
          {installEvent && <button className="btn primary" onClick={install}>Install</button>}
          <button className="link" onClick={dismiss} aria-label="Dismiss">Not now</button>
        </div>
      )}
    </>
  );
}
