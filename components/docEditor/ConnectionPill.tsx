"use client"

import * as React from "react"

import { Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The live doc's connection, said quietly (content.md D13): a 32 px pill
 * toast centred 12 px under the header, instead of a full-width strip. It
 * appears only once a problem has lasted 2 s, so blips never show, and after
 * it resolves it says "Back online" for 1.5 s.
 */
export type ConnectionProblem = "offline" | "reconnecting" | null

const SHOW_AFTER_MS = 2000
const BACK_FOR_MS = 1500

export function ConnectionPill({ problem, className }: { problem: ConnectionProblem; className?: string }) {
  const [shown, setShown] = React.useState<ConnectionProblem | "back">(null)
  const wasShown = React.useRef(false)

  React.useEffect(() => {
    if (problem) {
      const t = window.setTimeout(() => {
        wasShown.current = true
        setShown(problem)
      }, wasShown.current ? 0 : SHOW_AFTER_MS)
      return () => window.clearTimeout(t)
    }
    if (!wasShown.current) {
      setShown(null)
      return
    }
    wasShown.current = false
    setShown("back")
    const t = window.setTimeout(() => setShown(null), BACK_FOR_MS)
    return () => window.clearTimeout(t)
  }, [problem])

  if (!shown) return null
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center", className)}>
      <div
        role="status"
        aria-live="polite"
        data-connection-pill={shown}
        className="content-float pointer-events-auto inline-flex h-8 items-center gap-2 rounded-[16px] bg-pop px-3.5 text-ui-sm font-[450] text-ink shadow-e3"
      >
        {shown === "offline" ? (
          <>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-camp-sun" />
            Offline. Your changes are kept and will sync.
          </>
        ) : shown === "reconnecting" ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-ink-3" />
            Reconnecting…
          </>
        ) : (
          <>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-camp-moss" />
            Back online
          </>
        )}
      </div>
    </div>
  )
}
