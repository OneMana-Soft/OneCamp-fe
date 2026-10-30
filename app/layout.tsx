import type { Metadata, Viewport } from "next";
import "./globals.css";
// The interaction layer (INTERACTION_SPEC.md §9): hover, press, selected,
// focus and drag for every component that opts in. Before the phone layer,
// so a finger's own press still wins.
import "./interaction.css";
// The phone layer (design v3, mobile.md): after globals, so it outranks the
// shell's phone block at equal specificity.
import "./phone.css";
// The one overlay layout (components/ui/overlay): a header, a body that is the
// only scroller and a pinned footer, and the quiet bar inside overlays.
import "./overlay.css";
import "./inter.css";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunkRecoveryScript";
import { APP_BOOT_CSS, APP_BOOT_SCRIPT } from "@/lib/appBoot";
import { AppBootScreen } from "@/components/protectedRoute/Splash";
import { splashLinks } from "@/lib/pwa/splash";
import { THEME_COLOR_METAS } from "@/lib/pwa/grounds";

// One face for the whole app (design v3, "Type"): Inter, variable, with its
// optical-size axis, so a 14px label takes the text cut and a 30px title the
// display cut (globals.css). It retired Inter Tight, the display face, whose
// built-in tightening collided words at 14px. Its files are in public/fonts
// (app/inter.css), which matters for a product customers run on their own
// machines behind their own firewall: neither the build nor a page calls out
// to Google. Latin is preloaded; other scripts load when a page draws them.
const INTER_LATIN = "/fonts/inter/inter-latin.dd8a4575.woff2";

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
  // The browser's bar before any code runs: a phone's ground (lib/pwa/grounds),
  // in the system's mode, picked by media query. It was the light frame alone,
  // a light band over a dark app on every dark start. On an app address the
  // boot script sets every one to the exact ground in the mode chosen in the
  // app, and ThemeColorMeta keeps them on the chrome the person is looking at.
  themeColor: THEME_COLOR_METAS,
  // The page's own canvas before its stylesheet has arrived (it blocks the
  // first paint, seconds on a slow line): in the person's scheme, so a dark
  // system never sees white there. next-themes' explicit color-scheme on
  // <html> takes over as soon as it runs.
  colorScheme: "light dark",
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
    >
      <head>
        <link rel="preload" href={INTER_LATIN} as="font" type="font/woff2" crossOrigin="anonymous" />
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
        {/* The installed app's launch screen: the ground the app starts on,
            light or dark, so a dark app never starts on a white flash
            (lib/pwa/splash, lib/pwa/grounds). */}
        {splashLinks().map((l) => (
          <link key={l.href} rel="apple-touch-startup-image" href={l.href} media={l.media} />
        ))}
        <link rel="icon" href="/logo.svg" type="image/svg+xml" sizes="any" />
        {/* Before the app runs: a page from before a deploy reloads into the new build. */}
        <script dangerouslySetInnerHTML={{ __html: CHUNK_RECOVERY_SCRIPT }} />
      </head>
      <body className="antialiased bg-background text-foreground">
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
