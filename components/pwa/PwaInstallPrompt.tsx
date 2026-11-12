"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CornerCard } from "@/components/ui/CornerStack";
import { lazyPiece } from "@/lib/lazy/lazyPiece";
import { pwaPromptKind, type PwaPromptKind } from "@/lib/utils/pwaPrompt";

// Suggests adding OneCamp to the home screen, when that can actually be done.
// Which case applies is pwaPromptKind's decision; this component only reads
// the browser and remembers visits and dismissals.

// The card's words and buttons are a chunk of its own, fetched the first time
// there is something to suggest (FLUIDITY-13). Drawn through lazyPiece, they
// put lazyPiece on the root layout's first load, where the 404 views and the
// /app pieces find it: each group carried a copy of its own. The corner and
// the logo stay here, so the root keeps next/image and the corner stack, which
// every page that draws a picture or a corner card finds there; with the logo
// in the chunk, 26 page chunks each carried next/image (app/firstLoad.test.ts).
const PwaInstallCardBody = lazyPiece(() => import("./pwaInstallCard"), {
  // Code that can't come (offline) leaves no card with only a logo: the card
  // goes for this page, and asks again on the next visit.
  failed: function CardUnavailable({ onUnavailable }) {
    useEffect(() => onUnavailable(), [onUnavailable]);
    return null;
  },
});

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

  const unavailable = useCallback(() => setKind(null), []);

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setKind(null);
  };

  if (!kind) return null;

  return (
    // One boundary around the whole card: nothing of it shows until its words
    // and buttons have come, then all of it at once.
    <Suspense fallback={null}>
      {/* In the left-hand corner stack (components/ui/CornerStack), above the
          phone's tab bar; it sat on the devtools layer, over every dialog. */}
      <CornerCard side="left" order={2} className="w-full md:w-[400px]">
        <div className="relative flex items-center gap-3 rounded-xl bg-pop p-3 pr-10 text-ink shadow-e3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
            <Image src="/logo.svg" alt="" fill className="object-cover" />
          </div>
          <PwaInstallCardBody kind={kind} onInstall={install} onDismiss={dismiss} onUnavailable={unavailable} />
        </div>
      </CornerCard>
    </Suspense>
  );
}
