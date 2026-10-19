"use client"

import { useEffect } from "react";
import { ThemeProvider } from "@/components/themeProvider/theme-provider";
import store, { persistor } from "@/store/store";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { ActiveThemeProvider } from "@/components/activeTheme/activeTheme";
import { lazyPart } from "@/lib/lazy/lazyPart";
// A signed-in person's saved theme, applied once their profile has come: after
// the page has drawn, never with it. It brings the API client and the
// endpoints table, which every page carried, signed in or not, until 17 Oct
// 2026 (app/firstLoad.test.ts, ROOT_LAZY). A lazy part (lib/lazy/lazyPart):
// if its code can't come, the page keeps the theme it has and carries on, and
// it tries again when the browser is back online.
const Nothing = () => null;
const themeSync = lazyPart(() => import("@/components/activeTheme/ThemeSync").then((m) => m.ThemeSync), { placeholder: Nothing, failed: Nothing });
import { ThemeColorMeta } from "@/components/activeTheme/ThemeColorMeta";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Toaster } from "@/components/ui/toaster";
import { OfflineNotice } from "@/components/error/OfflineNotice";
import { UnsavedChangesGuard } from "@/components/ui/UnsavedChangesGuard";
import { listenForEscape } from "@/lib/keys/escape";

export function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // The one Escape, for every page: what answers it registers with onEscape.
  useEffect(() => listenForEscape(), []);
  return (
    <ThemeProvider defaultTheme="system" storageKey="ui-theme">
      <ActiveThemeProvider>
        <PersistGate loading={null} persistor={persistor}>
          <Provider store={store}>
            <MediaQueryProvider>
              <themeSync.Part />
              {/* Browser/OS chrome follows the shell the user actually chose. */}
              <ThemeColorMeta />
              <div className="theme-container relative h-full bg-background">
                {children}
              </div>
              <PwaInstallPrompt />
              {/* The one Toaster, under every page: the signed-in app's
                  providers held it, so a toast on a guest page, the invoice
                  page or a signed-out page drew nothing. */}
              <Toaster />
              {/* Says when the network or the server is gone, on every page. */}
              <OfflineNotice />
              {/* Asks before an in-app link leaves a SaveBar's changes unsaved. */}
              <UnsavedChangesGuard />
            </MediaQueryProvider>
          </Provider>
        </PersistGate>
      </ActiveThemeProvider>
    </ThemeProvider>
  );
}
