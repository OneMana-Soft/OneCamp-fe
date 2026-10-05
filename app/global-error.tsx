"use client"

// The last-resort error page. A failed code chunk (a page from before a
// deploy) reloads into the new build; anything else gets a way back instead
// of Next's bare "Application error" line.

import { useEffect } from "react"
import { isChunkLoadError, reloadForNewBuild } from "@/lib/chunkRecovery"

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chunk = isChunkLoadError(error)
  useEffect(() => {
    if (chunk) reloadForNewBuild()
  }, [chunk])
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", padding: 16, textAlign: "center" }}>
        <main>
          <h1 style={{ fontSize: 18, margin: "0 0 8px" }}>{chunk ? "OneCamp was just updated" : "Something went wrong"}</h1>
          <p style={{ margin: "0 0 16px", opacity: 0.75 }}>{chunk ? "Reloading to get the new version…" : "Reload the page to carry on. If it keeps happening, tell your admin."}</p>
          <button type="button" onClick={() => (chunk ? location.reload() : reset())} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ccc", background: "transparent", cursor: "pointer" }}>
            Reload
          </button>
        </main>
      </body>
    </html>
  )
}
