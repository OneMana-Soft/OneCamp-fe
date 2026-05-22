import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils/helpers/cn";
import { ClientProviders } from "@/components/providers/ClientProviders";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OneCamp",
  description: "Your workspace, unified.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={inter.variable}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="OneCamp" />
        <link rel="apple-touch-icon" href="/logo.svg" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" sizes="any" />
      </head>
      <body
        className={cn(
          inter.className,
          "antialiased bg-background text-foreground"
        )}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground focus:text-sm"
        >
          Skip to content
        </a>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
