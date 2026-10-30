"use client"

// A row of faces is the graphics' own now (components/ui/graphics/Faces), drawn here as before.
export { Faces } from "@/components/ui/graphics/Faces"
import * as React from "react"
import type { LucideIcon } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * The pieces a doc's and a board's lists of people and versions share: Viewed
 * by, and Version history. They were three dialogs with three looks: versions
 * in bordered cards with rounded pills (one in the accent) and grey initials,
 * viewers in plain rows; a spinner while either loaded; and an empty list that
 * was centred words under an icon in one, start-aligned words in the next.
 */

/** A row in such a list: on the dialog's ground, lit on hover, never a card. */
export const RESOURCE_ROW = "flex min-h-12 items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-highlight/60"


/** Rows the list's own height while it loads. */
export function ResourceListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} aria-hidden="true" className={cn(RESOURCE_ROW, "hover:bg-transparent")}>
          <Skeleton variant="circle" className="h-7 w-7 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", i % 2 ? "w-2/5" : "w-1/2")} />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** An empty list, said the same way in every such dialog. */
export function ResourceListEmpty({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <EmptyState icon={icon} title={title} description={description} className="py-8" headingLevel={3} />
}

/** Why a version was kept, as dot and word: a warning in its own colour, the rest quiet. */
export function VersionReason({ label, warning }: { label: string; warning?: boolean }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs", warning ? "text-warning-ink" : "text-muted-foreground")}>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", warning ? "bg-warning" : "bg-muted-foreground/60")} />
      {label}
    </span>
  )
}
