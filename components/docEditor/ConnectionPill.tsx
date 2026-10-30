"use client"

import * as React from "react"

import { SAY_PROBLEM_AFTER_MS } from "@/components/docEditor/connectionTiming"
import { CHANGES_KEPT } from "@/components/docEditor/SaveDot"
import { Button } from "@/components/ui/button"
import { useTellHeight } from "@/hooks/useTellHeight"
import { Loader2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The live doc's connection, said quietly (content.md D13): a 32 px pill
 * toast centred 12 px under the header, instead of a full-width strip. It
 * appears only once a problem has lasted 2 s, so blips never show, and after
 * it resolves it says "Back online" for 1.5 s. On a phone (docked) a floating
 * pill would sit over the title and its cover tools, so it is a full-width
 * row under the header instead, in the page's flow: the page moves down by
 * its height while it shows, and nothing is covered.
 */
export type ConnectionProblem = "offline" | "reconnecting" | "unavailable" | "stalled" | null

const BACK_FOR_MS = 1500

/**
 * "unavailable": the collaboration server could not read the doc and refused
 * to open it (it never serves one empty). The stored copy stays on screen,
 * read-only, and Retry asks again.
 * "stalled": signed in, but the doc hasn't come (the session's join
 * watchdog); Try again opens a new connection.
 * besideNotice: a save notice beside it (a doc with no header dot, D05:
 * DocSaveNotice) says what becomes of the work, so offline the pill names only
 * the connection; one surface per message (V-21, design review).
 */
export function ConnectionPill({
  problem,
  onRetry,
  docked = false,
  besideNotice = false,
  className,
}: {
  problem: ConnectionProblem
  onRetry?: () => void
  docked?: boolean
  besideNotice?: boolean
  className?: string
}) {
  const [shown, setShown] = React.useState<ConnectionProblem | "back">(null)
  const wasShown = React.useRef(false)

  React.useEffect(() => {
    if (problem) {
      const t = window.setTimeout(() => {
        wasShown.current = true
        setShown(problem)
      }, wasShown.current ? 0 : SAY_PROBLEM_AFTER_MS)
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

  // Docked, the row sits where a phone's toast comes in while the keyboard is
  // up (app/phone.css C9), so it says how tall it is, through resizes, and
  // toasts come in under it. A floating pill leaves the docked row's height
  // alone.
  const row = React.useRef<HTMLDivElement>(null)
  const tellRowHeight = React.useCallback(
    (px: number) => {
      if (!docked) return
      const root = document.documentElement
      if (px > 0) root.style.setProperty("--docked-row-h", `${px}px`)
      else root.style.removeProperty("--docked-row-h")
    },
    [docked],
  )
  useTellHeight(row, tellRowHeight, shown)

  if (!shown) return null
  return (
    <div className={cn(docked ? "shrink-0" : "pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center", className)}>
      <div
        ref={row}
        role="status"
        aria-live="polite"
        data-connection-pill={shown}
        className={cn(
          "items-center gap-2 text-ui-sm font-[450] text-ink",
          docked
            ? "flex h-11 w-full justify-center border-b border-line bg-raised px-4"
            : "content-float pointer-events-auto inline-flex h-8 rounded-[16px] bg-pop px-3.5 shadow-e3",
        )}
      >
        {shown === "unavailable" || shown === "offline" ? (
          <>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-camp-sun" />
            {shown === "offline" ? (
              besideNotice ? "Offline" : `Offline. ${CHANGES_KEPT}`
            ) : (
              <>
                Couldn&apos;t open this doc.
                {onRetry && <PillAction onClick={onRetry} docked={docked}>Retry</PillAction>}
              </>
            )}
          </>
        ) : shown === "reconnecting" || shown === "stalled" ? (
          <>
            <Loader2 aria-hidden="true" className="size-3.5 animate-spin text-ink-3" />
            {shown === "stalled" ? "Still connecting…" : "Reconnecting…"}
            {shown === "stalled" && onRetry && <PillAction onClick={onRetry} docked={docked}>Try again</PillAction>}
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

/** The pill's one action: the app's button (its hover, press and touch target), the smallest size in the pill, sm in the docked row. */
function PillAction({ onClick, docked, children }: { onClick: () => void; docked: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="secondary" size={docked ? "sm" : "xs"} onClick={onClick}>
      {children}
    </Button>
  )
}
