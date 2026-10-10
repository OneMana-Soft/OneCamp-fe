"use client"

import type { ReactNode } from "react"
import { AlertTriangle, Info, WifiOff, X } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

const TONE = {
  info: { row: "border-border bg-muted/60 text-muted-foreground", icon: Info, hover: "hover:bg-accent" },
  warning: { row: "border-warning/30 bg-warning/10 text-warning-ink", icon: AlertTriangle, hover: "hover:bg-warning/20" },
  danger: { row: "border-destructive/30 bg-destructive/10 text-danger-ink", icon: AlertTriangle, hover: "hover:bg-destructive/15" },
  offline: { row: "border-warning/30 bg-warning/10 text-warning-ink", icon: WifiOff, hover: "hover:bg-warning/20" },
} as const

/**
 * One line across the top of the page that says something about the whole
 * app: email that can't go out, a filling disk, the network gone. Every
 * notice is this row, so they read as one family: a 14px icon, 12px words,
 * and a dismiss button with a focus ring that is 32px on a desktop and 44px
 * under a finger. The banners each drew their own, with a ~18px dismiss and
 * no focus ring.
 *
 * It takes its own height above the page (the shell's banner slot), so it
 * covers nothing; a floating notice sat on the sidebar's Collapse button.
 */
export function NoticeBar({
  tone = "info",
  role = "status",
  children,
  onDismiss,
  dismissLabel = "Dismiss",
}: {
  tone?: keyof typeof TONE
  role?: "status" | "alert"
  children: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
}) {
  const t = TONE[tone]
  const Icon = t.icon
  return (
    <div data-notice={tone} role={role} className={cn("flex items-start gap-2 border-b py-1.5 pl-4 pr-1 text-xs", !onDismiss && "pr-4", t.row)}>
      <Icon className="mt-2 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 py-1.5">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors [@media(pointer:coarse)]:size-11",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
            t.hover,
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
