"use client"

import { LaterDueHost } from "@/components/later/LaterDueHost";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MqttProvider } from "@/components/mqtt/mqttProvider";
import GlobalCommandHost from "@/components/command/GlobalCommandHost";
import CommandActionBridge from "@/components/command/CommandActionBridge";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { LoadingProvider } from "@/context/LoadingContext";
import { SWRConfig } from "swr";
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge";
import { localStorageProvider } from "@/lib/swrCache";
import { sweepTTLKeys } from "@/lib/utils/helpers/ttlStorage";
import dynamic from "next/dynamic";
import { lazyPart } from "@/lib/lazy/lazyPart";
import "@/lib/env"; // Trigger validation on load
// Initialise i18next on the client. Side-effect import ONLY: the module
// runs i18n.use(initReactI18next).init({...}) at evaluation time. Without
// this, every t("myTasks") call returns the literal key (e.g. "myTasks")
// because no resources / language are registered with the i18n
// instance. This must be a "use client" tree because i18next runs in
// the browser.
import "@/lib/utils/i18n";

const ONE_HOUR_MS = 60 * 60 * 1000;

// The one chip for every data-tip label (components/ui/tipLayer), in a chunk of its own.
const TipLayer = dynamic(() => import("@/components/ui/tipLayer"), { ssr: false });
// The member's saved theme, applied once their profile has come, and their
// changes saved to it: here, under the cache the profile is read into. A lazy
// part: if its code can't come, the page keeps the theme it has.
const Nothing = () => null;
const themeSync = lazyPart(() => import("@/components/activeTheme/ThemeSync").then((m) => m.ThemeSync), { placeholder: Nothing, failed: Nothing });

export default function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // Boot-time sweep of TTL-bounded localStorage keys. Without this,
  // per-channel `catchmeup_dismissed_*` keys (and any future TTL
  // entries written via lib/utils/helpers/ttlStorage) accumulate
  // forever — eventually filling the browser quota and breaking every
  // other localStorage write (auth, theme, SWR cache).
  useEffect(() => {
    sweepTTLKeys("catchmeup_dismissed_", ONE_HOUR_MS);
  }, []);

  return (
    // SWRConfig with the localStorage cache provider gives users an
    // instant first paint of cached lists (channels, chats, tasks, …)
    // after a page reload, once the profile has said they're the member
    // they were kept for — the network revalidation still runs in
    // the background and updates the UI. Without this every reload was
    // a cold-start blank state.
    //
    // The provider is module-scoped, so the same Map is reused across
    // re-renders inside the page. On unload it serialises the Map to
    // localStorage; on first mount it deserialises back. See lib/swrCache.ts
    // for the persistence specifics.
    <SWRConfig value={{ provider: localStorageProvider }}>
      <SWRMutateBridge />
      <themeSync.Part />
      <MediaQueryProvider>
        <LoadingProvider>
          {/* One provider (design v3, shell M3): the first tooltip waits 500ms;
              a neighbour within 300ms shows at once (Emil Kowalski's rule). */}
          <TooltipProvider delayDuration={500} skipDelayDuration={300}>
            <MqttProvider>
              {children}
              <CommandActionBridge />
              <GlobalCommandHost />
              <LaterDueHost />
              <TipLayer />
            </MqttProvider>
          </TooltipProvider>
        </LoadingProvider>
      </MediaQueryProvider>
    </SWRConfig>
  );
}
