"use client"

/**
 * Parts of the connection cards on the Integrations tab and the Connectors
 * page (design v3, admin §A18 and S3), beside the slice's shared ones in
 * connectParts.tsx.
 */

import * as React from "react"
import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { SourceMark, type StateTone } from "@/components/admin/connectParts"
import { AlertTriangle, ArrowLeftRight } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * A connection's body while it loads: its rows' shape inside the card (a name,
 * a line under it, a button's place), so nothing moves when it arrives. The
 * card's header is drawn already; this is only what goes under it.
 */
export function ConnectionSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} data-connection-skeleton="">
      {[0, 1].map((i) => (
        <div key={i} data-connection-skeleton-row="" aria-hidden="true" className="cx-linked">
          <Skeleton className="size-3 shrink-0 rounded-sm" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="size-8 shrink-0 rounded-md" />
        </div>
      ))}
    </div>
  )
}

/**
 * A row inside a connection card that needs someone: a sun (or danger) glyph,
 * what happened, and the one way out on the right ("Reconnect"). It replaces
 * the tinted, bordered boxes these warnings were.
 */
export function ConnectionBanner({
  tone = "warning",
  children,
  action,
}: {
  tone?: "warning" | "danger"
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} data-connection-banner={tone} className="cx-int-banner">
      <AlertTriangle aria-hidden="true" className={cn("size-4 shrink-0", tone === "danger" ? "text-danger-ink" : "text-warning-ink")} />
      <div className="min-w-0 flex-1 text-sm text-foreground text-pretty">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  )
}

/** A line of help inside a connection card, at the card's inset. */
export function ConnectionNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("cx-int-note text-xs text-muted-foreground text-pretty", className)}>{children}</div>
}

/**
 * Whether a connection just came back from its sign-in round trip, so its dot
 * can morph off → on once (A18): the card marks `key` in sessionStorage as it
 * leaves for the provider (markConnecting), and the first answer that says
 * connected after that plays the morph and clears the mark. It also takes an
 * explicit signal (`returned`, the Connectors page's ?connector=success).
 *
 * Returns the tone to draw and whether the ring pulse plays: the dot starts
 * off for a frame and then takes the on colour, so its colour crossfades.
 */
export function useConnectMorph(key: string, connected: boolean | undefined, returned = false) {
  const [phase, setPhase] = useState<"idle" | "from" | "to">("idle")
  useEffect(() => {
    if (!connected) return
    let came = returned
    try {
      if (sessionStorage.getItem(`onecamp:connecting:${key}`)) {
        came = true
        sessionStorage.removeItem(`onecamp:connecting:${key}`)
      }
    } catch {
      // Storage refused (a private window): no morph, nothing else lost.
    }
    if (!came) return
    setPhase("from")
    let raf2 = 0
    const raf = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPhase("to"))
    })
    const done = window.setTimeout(() => setPhase("idle"), 900)
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(raf2)
      window.clearTimeout(done)
    }
  }, [key, connected, returned])
  const tone: StateTone = connected ? (phase === "from" ? "neutral" : "success") : "neutral"
  return { tone, morphing: phase === "to" }
}

/** Marks a connection as leaving for its provider's sign-in, for useConnectMorph. */
export function markConnecting(key: string) {
  try {
    sessionStorage.setItem(`onecamp:connecting:${key}`, "1")
  } catch {
    // No storage: the round trip still works, only the morph is skipped.
  }
}

/**
 * The Slack bridge's two marks, Slack ⇄ OneCamp, with a dot that travels
 * between them while messages are crossing (a channel is linked) and rests in
 * the middle when nothing is. Reduced motion stills it.
 */
export function BridgeMarks({ syncing }: { syncing: boolean }) {
  return (
    <span data-bridge-marks="" data-syncing={syncing ? "true" : undefined} className="cx-int-bridge" aria-hidden="true">
      <SourceMark vendor="slack" name="Slack" />
      <span className="cx-int-bridge-track">
        <ArrowLeftRight className="cx-int-bridge-arrow" />
        <span className="cx-int-bridge-dot" />
      </span>
      <SourceMark name="OneCamp" />
    </span>
  )
}
