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
import { isChunkLoadError } from "@/lib/chunkRecovery"
import { reloadForNewBuild } from "@/lib/newBuild"

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunk = isChunkLoadError(error)
  // Only when the server says the old build's code is gone (lib/chunkRecovery):
  // with no network the page stays, and its button reloads when asked.
  useEffect(() => {
    if (chunk) void reloadForNewBuild(error)
  }, [chunk, error])
  return (
    <html lang="en">
      <head>
        {/* This page replaces the root layout, so the app's stylesheet may be
            missing: design v3's tokens, written out (the frame and its glow,
            the inks, r8 buttons with the primary's inner highlight). */}
        <style>{`
          :root { color-scheme: light dark; --frame: #F3F4F6; --fg: #16171B; --ink-2: #5B5D65; --ink-3: #67696F; --brand: #CC4A0B; --on-brand: #FFFFFF; --glow: 255 110 30; }
          @media (prefers-color-scheme: dark) { :root { --frame: #0B0C0E; --fg: #EEEEF0; --ink-2: #A8ABB1; --ink-3: #95979E; --brand: #FF7A33; --on-brand: #0B0C0E; } }
          body { margin: 0; min-height: 100dvh; background: var(--frame); color: var(--fg); font: 14px/20px Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.006em; -webkit-font-smoothing: antialiased;
            background-image: radial-gradient(760px 520px at -80px -100px, rgb(var(--glow) / 0.2), transparent 68%); }
          main { box-sizing: border-box; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px 16px; }
          h1 { font-size: 15px; line-height: 20px; font-weight: 590; letter-spacing: -0.012em; margin: 14px 0 4px; }
          p { margin: 0 0 16px; color: var(--ink-2); max-width: 44ch; }
          button { height: 32px; padding: 0 14px; border: 0; border-radius: 8px; background: var(--brand); color: var(--on-brand); font: inherit; font-weight: 510; cursor: pointer;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.2), inset 0 -1px 0 rgba(0,0,0,.08), 0 0 0 1px color-mix(in oklab, var(--brand) 82%, #000), 0 1px 2px rgba(16,18,26,.18); }
          button:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
          svg { display: block; }
          .draw { stroke-dasharray: 100; animation: draw .6s cubic-bezier(.22,1,.36,1) both; }
          @keyframes draw { from { stroke-dashoffset: 100; } }
          @media (prefers-reduced-motion: reduce) { .draw { animation: none; } }
        `}</style>
      </head>
      <body>
        <main>
          {chunk ? (
            // The splash's ring, drawn once while the new build loads.
            <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
              <defs><linearGradient id="ge-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF8A00" /><stop offset="1" stopColor="#FF3D00" /></linearGradient></defs>
              <circle className="draw" cx="28" cy="28" r="18" fill="none" stroke="url(#ge-ring)" strokeWidth="8" strokeLinecap="round" pathLength={100} transform="rotate(-90 28 28)" />
            </svg>
          ) : (
            // The crash spot: the logo ring, broken.
            <svg width="72" height="72" viewBox="0 0 96 96" aria-hidden="true">
              <circle cx="48" cy="48" r="36" fill="#B98200" fillOpacity=".14" />
              <circle cx="48" cy="48" r="20" fill="none" stroke="#B98200" strokeWidth="7" strokeDasharray="80 200" strokeLinecap="round" transform="rotate(30 48 48)" />
              <circle cx="48" cy="48" r="20" fill="none" stroke="#B98200" strokeWidth="7" strokeDasharray="30 200" strokeDashoffset="-100" strokeLinecap="round" transform="rotate(30 48 48)" opacity=".45" />
            </svg>
          )}
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
