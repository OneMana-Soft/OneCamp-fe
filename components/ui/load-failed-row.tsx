"use client"

import { useEffect, useState, type ReactNode } from "react"
import { NoticeBar } from "@/components/banner/NoticeBar"
import { Button } from "@/components/ui/button"
import { useSaysLoadFailure } from "@/lib/http/loadFailure"
import { AlertTriangle, RefreshCw } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/** How long the row takes to fade once what it names has loaded. */
const LEAVE_MS = 160

/**
 * LoadFailedRow: part of a page couldn't load, said in one row above the part
 * that did (partial data). ErrorState is for a surface with no content; here
 * the rest stays drawn and live, so the failure is said once and quietly, in
 * the page's flow: never over what loaded, and never as a toast. It can't be
 * dismissed while what it names is missing, since a dismissed notice brings
 * back the wrong reading (a teammate who looks free), and it fades out once
 * that has loaded.
 *
 * A NoticeBar on the sunken ground, with the alert in sun ink. Try again is
 * the base Button, busy in place under the same name, so the status is
 * announced once.
 */
export function LoadFailedRow({
  shown,
  onRetry,
  retrying,
  children,
}: {
  /** While what it names is missing. */
  shown: boolean
  onRetry: () => void
  /** Set while what it names is asked for again. */
  retrying?: boolean
  /** What's missing and what that means: "Couldn't load …, so … aren't shown." */
  children: ReactNode
}) {
  const [present, setPresent] = useState(shown)
  useEffect(() => {
    if (shown) {
      setPresent(true)
      return
    }
    const t = window.setTimeout(() => setPresent(false), LEAVE_MS)
    return () => window.clearTimeout(t)
  }, [shown])
  useSaysLoadFailure(shown)
  if (!shown && !present) return null
  return (
    <div
      data-load-failed-row=""
      data-leaving={shown ? undefined : ""}
      className={cn("shrink-0 transition-opacity duration-[160ms] ease-out", !shown && "opacity-0")}
    >
      <NoticeBar
        tone="info"
        icon={<AlertTriangle className="size-3.5 shrink-0 text-camp-sun" aria-hidden="true" />}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={onRetry} busy={retrying}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        }
      >
        {children}
      </NoticeBar>
    </div>
  )
}
