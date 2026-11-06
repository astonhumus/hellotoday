import { useEffect, useState } from "react";

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

// The browser fires "beforeinstallprompt" once, early. It is kept here so Settings can offer Install later too.
let saved: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());

if (typeof window !== "undefined") {
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); saved = e as InstallEvent; emit(); });
  addEventListener("appinstalled", () => { saved = null; emit(); });
}

export const isStandalone = () => matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/** Whether the app can be installed with one tap, and the function that asks. */
export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick(n => n + 1);
    listeners.add(f);
    return () => void listeners.delete(f);
  }, []);
  return {
    canPrompt: !!saved,
    installed: isStandalone(),
    ios: isIos(),
    prompt: async () => { const e = saved; if (!e) return; await e.prompt(); saved = null; emit(); }
  };
}
