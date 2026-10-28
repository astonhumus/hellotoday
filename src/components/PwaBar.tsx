import { useEffect, useState } from "react";
import { store } from "../lib/data";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const standalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;

// A thin strip under the header: offline notice, and an "Install app" offer until it is installed or dismissed.
export function PwaBar() {
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => store.get("install-dismissed") === "1");

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    const before = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    addEventListener("online", on);
    addEventListener("offline", off);
    addEventListener("beforeinstallprompt", before);
    addEventListener("appinstalled", () => setInstallEvent(null));
    return () => { removeEventListener("online", on); removeEventListener("offline", off); removeEventListener("beforeinstallprompt", before); };
  }, []);

  const dismiss = () => { store.set("install-dismissed", "1"); setDismissed(true); };
  const install = async () => { await installEvent?.prompt(); setInstallEvent(null); };

  return (
    <>
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
