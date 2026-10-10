"use client"

import { ThemeProvider } from "@/components/themeProvider/theme-provider";
import store, { persistor } from "@/store/store";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { ActiveThemeProvider } from "@/components/activeTheme/activeTheme";
import { ThemeSync } from "@/components/activeTheme/ThemeSync";
import { ThemeColorMeta } from "@/components/activeTheme/ThemeColorMeta";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Toaster } from "@/components/ui/toaster";

export function ClientProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider defaultTheme="light" storageKey="ui-theme">
      <ActiveThemeProvider>
        <PersistGate loading={null} persistor={persistor}>
          <Provider store={store}>
            <MediaQueryProvider>
              <ThemeSync />
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
            </MediaQueryProvider>
          </Provider>
        </PersistGate>
      </ActiveThemeProvider>
    </ThemeProvider>
  );
}
