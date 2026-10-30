"use client"

import { useEffect, useSyncExternalStore } from "react";
import { ThemeProvider } from "@/components/themeProvider/theme-provider";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { ActiveThemeProvider } from "@/components/activeTheme/activeTheme";
// A signed-in member's saved theme is the app's (app/app/ClientProviders),
// where their profile is.
import { ThemeColorMeta } from "@/components/activeTheme/ThemeColorMeta";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Toaster } from "@/components/ui/toaster";
import { OfflineNotice } from "@/components/error/OfflineNotice";
import { listenForEscape } from "@/lib/keys/escape";
import { AppRouterProvider } from "@/lib/navigation/appRouter";

const unchanging = () => () => {};

export function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  // The one Escape, for every page: what answers it registers with onEscape.
  useEffect(() => listenForEscape(), []);
  // Pages draw in the browser, after hydration: the server sends the layout's
  // boot screens, and pages read the browser (storage, the window) as they
  // draw. The Redux store isn't here: /app's layout provides it, and a part
  // outside /app that reads it brings it (components/providers/StoreProvider).
  const inBrowser = useSyncExternalStore(unchanging, () => true, () => false);
  return (
    // The router's moves for every page, without the address: what only
    // navigates doesn't draw again when the address moves (lib/navigation/appRouter).
    <AppRouterProvider>
      <ThemeProvider defaultTheme="system" storageKey="ui-theme">
        <ActiveThemeProvider>
          {inBrowser && (
            <MediaQueryProvider>
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
            </MediaQueryProvider>
          )}
        </ActiveThemeProvider>
      </ThemeProvider>
    </AppRouterProvider>
  );
}
