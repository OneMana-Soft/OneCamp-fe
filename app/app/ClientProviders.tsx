"use client"

import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MqttProvider } from "@/components/mqtt/mqttProvider";
import { Toaster } from "@/components/ui/toaster";
import GlobalCommandHost from "@/components/command/GlobalCommandHost";
import CommandActionBridge from "@/components/command/CommandActionBridge";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { LoadingProvider } from "@/context/LoadingContext";
import { SWRConfig } from "swr";
import { localStorageProvider } from "@/lib/swrCache";
import { sweepTTLKeys } from "@/lib/utils/helpers/ttlStorage";
import "@/lib/env"; // Trigger validation on load
// Initialise i18next on the client. Side-effect import ONLY: the module
// runs i18n.use(initReactI18next).init({...}) at evaluation time. Without
// this, every t("myTasks") call returns the literal key (e.g. "myTasks")
// because no resources / language are registered with the i18n
// instance. This must be a "use client" tree because i18next runs in
// the browser.
import "@/lib/utils/i18n";

const ONE_HOUR_MS = 60 * 60 * 1000;

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
    // instant first paint of cached lists (channels, tasks, import jobs,
    // …) after a page reload — the network revalidation still runs in
    // the background and updates the UI. Without this every reload was
    // a cold-start blank state.
    //
    // The provider is module-scoped, so the same Map is reused across
    // re-renders inside the page. On unload it serialises the Map to
    // localStorage; on first mount it deserialises back. See lib/swrCache.ts
    // for the persistence specifics.
    <SWRConfig value={{ provider: localStorageProvider }}>
      <MediaQueryProvider>
        <LoadingProvider>
          <TooltipProvider delayDuration={200}>
            <MqttProvider>
              {children}
              <CommandActionBridge />
              <GlobalCommandHost />
              <Toaster />
            </MqttProvider>
          </TooltipProvider>
        </LoadingProvider>
      </MediaQueryProvider>
    </SWRConfig>
  );
}
