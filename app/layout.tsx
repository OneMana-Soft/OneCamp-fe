import type { Metadata, Viewport } from "next";
import "./globals.css";
// The interaction layer (INTERACTION_SPEC.md §9): hover, press, selected,
// focus and drag for every component that opts in. Before the phone layer,
// so a finger's own press still wins.
import "./interaction.css";
// The phone layer (design v3, mobile.md): after globals, so it outranks the
// shell's phone block at equal specificity.
import "./phone.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils/helpers/cn";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunkRecovery";
import { APP_BOOT_CSS, APP_BOOT_SCRIPT } from "@/lib/appBoot";
import { AppBootScreen } from "@/components/protectedRoute/Splash";
import { splashLinks } from "@/lib/pwa/splash";

// One face for the whole app (design v3, "Type"): Inter, variable, with its
// optical-size axis, so a 14px label takes the text cut and a 30px title the
// display cut (globals.css). It retired Inter Tight, the display face, whose
// built-in tightening collided words at 14px. Self-hosted at build time by
// next/font, which matters for a product customers run on their own machines
// behind their own firewall: nothing here calls out to Google at runtime.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  axes: ["opsz"],
});

// metadataBase makes the generated card URLs absolute. Without it Next emits a
// relative og:image, which every social scraper drops, so the card would exist
// and still never render.
//
// Read from configuration with NO fallback, and that is the point. A literal
// hostname here is one install's address baked into everybody's: every customer
// would serve cards pointing at somebody else's server, and it would build,
// render and look fine. An install that has not set this gets relative URLs and
// a plain link preview, which is the honest failure.
const appUrl = process.env.NEXT_PUBLIC_APP_URL;

// The API's origin. Every page's first call goes there (the session check on
// the start page, the profile in the app), and a new connection to it costs
// DNS, TCP and TLS before the first byte: started from the document's head,
// that overlaps the page's own code loading instead of following it.
const apiOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_BACKEND_URL ? new URL(process.env.NEXT_PUBLIC_BACKEND_URL).origin : null;
  } catch {
    return null;
  }
})();

export const metadata: Metadata = {
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
  title: "OneCamp",
  description: "Your workspace, unified.",
  // A shared OneCamp link used to render as a bare URL: no image, no title, no
  // description. The demo is the single most useful thing to share and it was
  // the least presentable.
  openGraph: {
    type: "website",
    siteName: "OneCamp",
    title: "OneCamp",
    description:
      "Chat, documents, tasks, boards, calendar and video calls. One install, on your server, with no per-seat pricing.",
    ...(appUrl ? { url: appUrl } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: "OneCamp",
    description:
      "Chat, documents, tasks, boards, calendar and video calls. One install, on your server, with no per-seat pricing.",
  },
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
  // The on-screen keyboard resizes the page, so 100dvh is the room it leaves
  // and a composer on the bottom edge sits on top of it. Chrome on Android
  // stopped doing that by default in version 108 (the keyboard now covers the
  // page), which put every composer behind it. iOS ignores this and is
  // handled in lib/ui/visualViewport.ts.
  interactiveWidget: "resizes-content",
  // Light is the default mode, so this is the correct pre-hydration value; it
  // matches the manifest's theme_color and background_color, so the install
  // splash doesn't flash a different colour into the app shell. ThemeColorMeta
  // then keeps the tag equal to the background the user actually chose.
  // Matches --frame in the light theme (design v3), the colour of the frame the browser
  // chrome continues. The manifest carries the same value.
  themeColor: "#f3f4f6",
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
        {/* Calls to the API carry credentials, so the warmed connection must too. */}
        {apiOrigin && <link rel="preconnect" href={apiOrigin} crossOrigin="use-credentials" />}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="OneCamp" />
        {/* iOS does not accept SVG for apple-touch-icon — pointing it at logo.svg
            meant the home-screen icon fell back to a screenshot of the page.
            This is an opaque 180px PNG, the size iOS actually asks for. */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        {/* The installed app's launch screen: the frame's colour, light or
            dark, so a dark app never starts on a white flash (lib/pwa/splash). */}
        {splashLinks().map((l) => (
          <link key={l.href} rel="apple-touch-startup-image" href={l.href} media={l.media} />
        ))}
        <link rel="icon" href="/logo.svg" type="image/svg+xml" sizes="any" />
        {/* Before the app runs: a page from before a deploy reloads into the new build. */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
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
        {/* The app's splash from the first paint, until its code has run
            (lib/appBoot): the server sends no markup for an app page, which
            was a blank white page for seconds. After the providers, so the
            theme's mode is set before it is parsed. */}
        <style>{APP_BOOT_CSS}</style>
        <AppBootScreen className="app-boot fixed inset-0 z-[var(--z-toast)]" />
        {/* Right after it, before anything is drawn: shown on an app address, in its theme. */}
        <script dangerouslySetInnerHTML={{ __html: APP_BOOT_SCRIPT }} />
      </body>
    </html>
  );
}
