"use client"

import * as React from "react"
import { Waypoints } from "@/lib/icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils/helpers/cn"
import type { GraphRootKind } from "@/lib/workGraph/workGraph"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

// The panel loads on the first press (app/connectedPanelLazy.test.ts).
const Overlay = lazyPiece(() => import("./ConnectedOverlay"))
const warm = () => void import("./ConnectedOverlay")

/** "Connected" (DG5): opens what this is connected to, as a popover or a phone sheet. */
export function ConnectedTrigger(p: { kind: GraphRootKind; id: string; title?: string; className?: string; label?: string; showLabel?: boolean; tip?: string; onNavigate?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLButtonElement>(null)
  if (!p.id) return null
  const label = p.label ?? "Connected"
  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={p.showLabel ? undefined : `${label}: what this connects to`}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-connected-trigger={p.kind}
      data-interactive={p.showLabel ? "button" : "icon"}
      data-hue="ink"
      data-state={open ? "open" : "closed"}
      onPointerEnter={warm}
      onFocus={warm}
      onClick={() => setOpen((o) => !o)}
      className={cn("inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md text-ink-3 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring aria-expanded:text-ink", p.showLabel ? "h-8 px-2.5 text-meta font-medium" : "size-8", p.className)}
    >
      <Waypoints aria-hidden="true" className="size-4" />
      {p.showLabel ? label : null}
    </button>
  )
  // The tip wraps the button alone: the panel inside a tip's trigger would
  // open the tip from the panel's own focus, and Escape would shut the tip first.
  return (
    <>
      {p.tip ? (
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{p.tip}</TooltipContent>
        </Tooltip>
      ) : button}
      {open ? (
        <React.Suspense fallback={null}>
          <Overlay kind={p.kind} id={p.id} title={p.title} anchor={ref} onClose={() => setOpen(false)} onNavigate={() => (setOpen(false), p.onNavigate?.())} />
        </React.Suspense>
      ) : null}
    </>
  )
}
