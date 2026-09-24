"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { X, Share } from "@/lib/icons";
import { pwaPromptKind, type PwaPromptKind } from "@/lib/utils/pwaPrompt";

// Suggests adding OneCamp to the home screen, when that can actually be done.
// Which case applies is pwaPromptKind's decision; this component only reads
// the browser and remembers visits and dismissals.

const DEMO = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const VISITS_KEY = "onecamp:pwa:visits";
const DISMISSED_KEY = "onecamp:pwa:dismissedAt";
const SESSION_KEY = "onecamp:pwa:counted";

// Storage can be missing or throw (private windows, blocked site data); the
// prompt then simply does not remember, and nothing breaks.
function readNumber(key: string): number | null {
  try {
    const v = window.localStorage.getItem(key);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function writeNumber(key: string, n: number) {
  try {
    window.localStorage.setItem(key, String(n));
  } catch {
    /* not remembered */
  }
}

// countVisit adds one per browser session, not per page.
function countVisit(): number {
  let visits = readNumber(VISITS_KEY) ?? 0;
  try {
    if (!window.sessionStorage.getItem(SESSION_KEY)) {
      window.sessionStorage.setItem(SESSION_KEY, "1");
      visits += 1;
      writeNumber(VISITS_KEY, visits);
    }
  } catch {
    /* not counted */
  }
  return visits;
}

// The browser's install event: prompt() shows the install dialog once.
interface InstallEvent extends Event {
  prompt: () => void;
  userChoice: Promise<unknown>;
}

export function PwaInstallPrompt() {
  const [kind, setKind] = useState<PwaPromptKind>(null);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const ua = window.navigator.userAgent.toLowerCase();
    const env = {
      mobile: /iphone|ipad|ipod|android/.test(ua),
      ios: /iphone|ipad|ipod/.test(ua),
      standalone:
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((window.navigator as unknown as { standalone?: boolean }).standalone),
      demo: DEMO,
      dismissedAt: readNumber(DISMISSED_KEY),
      visits: countVisit(),
      now: Date.now(),
    };
    setKind(pwaPromptKind({ ...env, canPrompt: false }));

    const onPrompt = (e: Event) => {
      // Keep the browser's own mini-infobar away; we ask at our own moment.
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setKind(pwaPromptKind({ ...env, canPrompt: true }));
    };
    const onInstalled = () => {
      setDeferred(null);
      setKind(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    writeNumber(DISMISSED_KEY, Date.now());
    setKind(null);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setKind(null);
  };

  if (!kind) return null;

  return (
    // Above the mobile bottom navigation, not on it.
    <div className="fixed left-4 right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[var(--z-devtools)] md:bottom-4 md:left-auto md:right-4 md:w-[400px] animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      <div className="relative flex items-center gap-3 rounded-xl border border-border/60 bg-background/95 p-3 pr-10 shadow-lg backdrop-blur-xl">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
          <Image src="/logo.svg" alt="" fill className="object-cover" />
        </div>
        {kind === "install" ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Add OneCamp to your home screen</p>
              <p className="text-xs text-muted-foreground">Opens like an app, with notifications.</p>
            </div>
            <button
              onClick={install}
              className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Install
            </button>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Add OneCamp to your home screen</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Tap <Share className="mx-0.5 inline h-3 w-3 text-foreground" /> Share, then <strong>Add to Home Screen</strong>.
            </p>
          </div>
        )}
        <button
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Not now"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
