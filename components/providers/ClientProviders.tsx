"use client"

import { ThemeProvider } from "@/components/themeProvider/theme-provider";
import store, { persistor } from "@/store/store";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import { MediaQueryProvider } from "@/context/MediaQueryContext";
import { ActiveThemeProvider } from "@/components/activeTheme/activeTheme";
import { ThemeSync } from "@/components/activeTheme/ThemeSync";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";

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
              <div className="theme-container relative h-full bg-background">
                {children}
              </div>
              <PwaInstallPrompt />
            </MediaQueryProvider>
          </Provider>
        </PersistGate>
      </ActiveThemeProvider>
    </ThemeProvider>
  );
}
