"use client"

import * as React from "react"

import { SAY_PROBLEM_AFTER_MS } from "@/components/docEditor/connectionTiming"
import { CHANGES_KEPT } from "@/components/docEditor/SaveDot"
import { useClaimOffline } from "@/components/error/pillPlace"
import { Button } from "@/components/ui/button"
import { useTellHeight } from "@/hooks/useTellHeight"
import { cn } from "@/lib/utils/helpers/cn"

// ConnectionPill's wait, frame and offline words, loaded with the doc so its
// stand-in (LazyConnectionPill) says them before the pill's code is in (V-667).
export type ConnectionProblem = "offline" | "reconnecting" | "unavailable" | "stalled" | null
export type Shown = ConnectionProblem | "back"

const BACK_FOR_MS = 1500

/** A problem is said once it has lasted 2 s (blips never show), the next at once, then "back" for 1.5 s. carried: the stand-in's said, for the pill. */
export function useShownProblem(problem: ConnectionProblem, carried?: React.RefObject<boolean>): Shown {
  const own = React.useRef(false)
  const said = carried ?? own
  const [shown, setShown] = React.useState<Shown>(() => (said.current ? problem : null))

  React.useEffect(() => {
    if (problem) {
      const t = window.setTimeout(() => {
        said.current = true
        setShown(problem)
      }, said.current ? 0 : SAY_PROBLEM_AFTER_MS)
      return () => window.clearTimeout(t)
    }
    if (!said.current) {
      setShown(null)
      return
    }
    said.current = false
    setShown("back")
    const t = window.setTimeout(() => setShown(null), BACK_FOR_MS)
    return () => window.clearTimeout(t)
  }, [problem, said])

  return shown
}

/** Docked, a row that says its height: a phone's toasts come in under it (app/phone.css C9). Lost, the page's offline voice (V-695). */
export function PillFrame({ shown, docked, className, children }: { shown: NonNullable<Shown>; docked: boolean; className?: string; children: React.ReactNode }) {
  useClaimOffline(shown === "offline" || shown === "reconnecting")
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
        {children}
      </div>
    </div>
  )
}

export const needsNoCode = (shown: Shown): shown is "offline" | "unavailable" => shown === "offline" || shown === "unavailable"

export function ProblemWords({ shown, onRetry, docked, besideNotice }: { shown: "offline" | "unavailable"; onRetry?: () => void; docked: boolean; besideNotice?: boolean }) {
  return (
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
  )
}

export function PillAction({ onClick, docked, children }: { onClick: () => void; docked: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant="secondary" size={docked ? "sm" : "xs"} onClick={onClick}>
      {children}
    </Button>
  )
}
