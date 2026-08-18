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
  // No maximumScale/userScalable lock. Blocking pinch-zoom fails WCAG 1.4.4 and
  // is miserable for anyone who needs to magnify a dense table or a diagram —
  // and it is usually only added to stop iOS zooming when a small input takes
  // focus. That is already handled properly: Input and Textarea are text-base
  // (16px) on mobile with md:text-sm, and the tiptap composer inherits the 16px
  // root, so nothing here trips iOS's <16px auto-zoom.
  viewportFit: "cover",
  // Light is the default mode, so this is the correct pre-hydration value; it
  // matches the manifest's theme_color and background_color, so the install
  // splash doesn't flash a different colour into the app shell. ThemeColorMeta
  // then keeps the tag equal to the background the user actually chose.
  themeColor: "#ffffff",
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
        {/* iOS does not accept SVG for apple-touch-icon — pointing it at logo.svg
            meant the home-screen icon fell back to a screenshot of the page.
            This is an opaque 180px PNG, the size iOS actually asks for. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
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
