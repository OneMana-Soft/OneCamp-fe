"use client"

import { LaterDueHost } from "@/components/later/LaterDueHost";
import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MqttProvider } from "@/components/mqtt/mqttProvider";
import GlobalCommandHost from "@/components/command/GlobalCommandHost";
import CommandActionBridge from "@/components/command/CommandActionBridge";
import AiQuickInvoke from "@/components/ai/AiQuickInvoke";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { LoadingProvider } from "@/context/LoadingContext";
import { SWRConfig } from "swr";
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge";
import { localStorageProvider } from "@/lib/swrCache";
import { sweepTTLKeys } from "@/lib/utils/helpers/ttlStorage";
import { PersistGate } from "redux-persist/integration/react";
import { persistor } from "@/store/store";
import { StoreProvider } from "@/components/providers/StoreProvider";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import dynamic from "next/dynamic";
import { lazyPart } from "@/lib/lazy/lazyPart";
import "@/lib/env"; // Trigger validation on load

const ONE_HOUR_MS = 60 * 60 * 1000;

// The one chip for every data-tip label (components/ui/tipLayer), in a chunk of its own.
const TipLayer = dynamic(() => import("@/components/ui/tipLayer"), { ssr: false });
// The member's saved theme, applied once their profile is in the cache, and
// their changes saved (lazy: without its code the page keeps its theme).
const themeSync = lazyPart(() => import("@/components/activeTheme/ThemeSync").then((m) => m.ThemeSync));

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
    // The Redux store for every page of the app, its kept slices (Recent)
    // read back before anything draws. Pages outside /app have none.
    <PersistGate loading={null} persistor={persistor}>
      <StoreProvider>
        {/* SWRConfig with the localStorage cache provider gives users an
            instant first paint of cached lists (channels, chats, tasks, …)
            after a page reload, once the profile has said they're the member
            they were kept for — the network revalidation still runs in
            the background and updates the UI. Without this every reload was
            a cold-start blank state.

            The provider is module-scoped, so the same Map is reused across
            re-renders inside the page. On unload it serialises the Map to
            localStorage; on first mount it deserialises back. See lib/swrCache.ts
            for the persistence specifics. */}
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
                  <AiQuickInvoke />
                  <TipLayer />
                  {/* Asks before an in-app link leaves a SaveBar's changes
                      unsaved: every SaveBar is in the app, and so is the
                      dialog it asks with (UnifiedUIManager). */}
                  <UnsavedChangesGuard />
                </MqttProvider>
              </TooltipProvider>
            </LoadingProvider>
          </MediaQueryProvider>
        </SWRConfig>
      </StoreProvider>
    </PersistGate>
  );
}
