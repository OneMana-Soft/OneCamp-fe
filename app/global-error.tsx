"use client"

// The last-resort error page. A failed code chunk (a page from before a
// deploy) reloads into the new build; anything else gets a way back instead
// of Next's bare "Application error" line.
//
// The button reloads the page, as it says. For an ordinary error it called
// reset(), which only renders the same tree again and usually throws again:
// the person pressed Reload and nothing changed. This page stands in for the
// whole app, so a fresh load is the one recovery worth offering.

import { useEffect } from "react"
import { isChunkLoadError, reloadForNewBuild } from "@/lib/chunkRecovery"

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunk = isChunkLoadError(error)
  useEffect(() => {
    if (chunk) reloadForNewBuild()
  }, [chunk])
  return (
    <html lang="en">
      <head>
        {/* This page replaces the root layout, so the app's stylesheet may be
            missing: the colours are the design tokens, written out. */}
        <style>{`
          :root { color-scheme: light dark; --bg: #FCFCFD; --fg: #14161A; --muted: #5F6470; --brand: #CC4A0B; --on-brand: #FFFFFF; }
          @media (prefers-color-scheme: dark) { :root { --bg: #0E0F11; --fg: #EDEEF0; --muted: #9BA0AA; --brand: #FF7A33; --on-brand: #0E0F11; } }
          body { margin: 0; min-height: 100dvh; background: var(--bg); color: var(--fg); font: 14px/20px Inter, system-ui, sans-serif; }
          main { box-sizing: border-box; max-width: 360px; margin: 0 auto; padding: clamp(24px, 14vh, 112px) 16px 64px; }
          h1 { font-size: 24px; line-height: 32px; font-weight: 600; margin: 0 0 8px; }
          p { margin: 0 0 32px; color: var(--muted); }
          button { width: 100%; height: 40px; border: 0; border-radius: 6px; background: var(--brand); color: var(--on-brand); font: inherit; font-weight: 500; cursor: pointer; }
          button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
        `}</style>
      </head>
      <body>
        <main>
          <h1>{chunk ? "OneCamp was just updated" : "Something went wrong"}</h1>
          <p>{chunk ? "Reloading to get the new version…" : "Reload the page to carry on. If it keeps happening, tell your admin."}</p>
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}
