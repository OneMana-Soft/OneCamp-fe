"use client"

import "./globals.css";
import {ThemeProvider} from "@/components/themeProvider/theme-provider";
import store, { persistor } from "@/store/store";
import { PersistGate } from "redux-persist/integration/react";
import { Provider } from "react-redux";
import {MediaQueryProvider} from "@/context/MediaQueryContext";
import {ActiveThemeProvider} from "@/components/activeTheme/activeTheme";
import "@/lib/utils/i18n"

import { SWRConfig } from "swr";
import { localStorageProvider } from "@/lib/swrCache";



import { Inter, Lato } from "next/font/google";
import { cn } from "@/lib/utils/helpers/cn";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const lato = Lato({ subsets: ["latin"], weight: ["100", "300", "400", "700", "900"], variable: "--font-lato" });

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (

          <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
            <head>
              <link rel="manifest" href="/manifest.json" />
              <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
              <meta name="theme-color" content="#000000" />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta name="apple-mobile-web-app-status-bar-style" content="default" />
              <meta name="apple-mobile-web-app-status-bar-style" content="default" />
              <meta name="apple-mobile-web-app-title" content="OneCamp" />
              <link rel="apple-touch-icon" href="/logo.svg" />
              <link rel="icon" href="/logo.svg" type="image/svg+xml" sizes="any" />
            </head>

          <body className={cn(lato.className, inter.variable, "antialiased")}>
          {/*<SWRConfig value={{ provider: localStorageProvider }}>*/}
          <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
              <ActiveThemeProvider initialTheme="blue">
              <PersistGate loading={null} persistor={persistor}>
                  <Provider store={store}>
                      <MediaQueryProvider>
                          <div className='theme-container select-none relative h-full bg-background transition-colors duration-500'>
                              {children}
                          </div>

                          <PwaInstallPrompt />
                      </MediaQueryProvider>
                  </Provider>
              </PersistGate>
              </ActiveThemeProvider>
          </ThemeProvider>
          {/*</SWRConfig>*/}
          </body>


          </html>


  );
}
