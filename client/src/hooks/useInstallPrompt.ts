import { useEffect, useState } from "react";

/**
 * "Instalar o app" (PWA). O navegador avisa quando a instalação é possível pelo
 * evento beforeinstallprompt, que pode chegar antes de qualquer tela montar:
 * por isso ele é guardado aqui, assim que este módulo carrega.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    listeners.forEach((fn) => fn());
  });
}

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as any).standalone === true
  );
}

/** iPhone/iPad não têm o evento: a instalação é manual pelo botão Compartilhar. */
function isIos() {
  const ua = navigator.userAgent || "";
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function useInstallPrompt() {
  const [, force] = useState(0);
  useEffect(() => {
    const update = () => force((n) => n + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  if (typeof window === "undefined" || isStandalone()) {
    return { canInstall: false, iosInstructions: false, install: async () => false };
  }

  return {
    canInstall: !!deferred,
    iosInstructions: !deferred && isIos(),
    install: async () => {
      if (!deferred) return false;
      const event = deferred;
      deferred = null;
      await event.prompt();
      const choice = await event.userChoice.catch(() => ({ outcome: "dismissed" }));
      listeners.forEach((fn) => fn());
      return choice.outcome === "accepted";
    },
  };
}
