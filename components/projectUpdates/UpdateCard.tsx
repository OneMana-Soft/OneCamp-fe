"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { HealthPill } from "@/components/projectUpdates/HealthPill"
import { UpdateText } from "@/components/projectUpdates/UpdateText"
import { Eye, Pencil, Trash2 } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { daysAgo } from "@/lib/utils/relativeTime"
import { fullDateTime } from "@/lib/utils/date/shortDate"

/** What a card shows: a project's update or a goal's check-in. */
export interface CardUpdate {
  id: string
  health: string
  author_name: string
  body: string
  created_at: string
  updated_at: string
  shared_with_client?: boolean
}

/**
 * One update or check-in: where it stood, who wrote it and when, the note,
 * and (for whoever may) editing and deleting it, with a confirmation.
 * detail sits under the header: a goal's check-in says where its number moved.
 */
export function UpdateCard({
  update,
  now,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
  detail,
  noun = "update",
}: {
  update: CardUpdate
  now: number
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  detail?: ReactNode
  noun?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const edited = Date.parse(update.updated_at) - Date.parse(update.created_at) > 60_000
  return (
    <article className="group rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <HealthPill health={update.health} />
        <p className="min-w-0 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{update.author_name}</span>
          {" · "}
          <time dateTime={update.created_at} title={fullDateTime(new Date(update.created_at))}>
            {daysAgo(update.created_at, now)}
          </time>
          {edited && " · edited"}
        </p>
        {update.shared_with_client && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground"
            title="Shown on the project's client link"
          >
            <Eye className="h-3 w-3" /> Client can see this
          </span>
        )}
        {(canEdit || canDelete) && (
          <div
            className={cn(
              "ml-auto flex items-center gap-1 transition-opacity",
              // Revealed on hover or focus with a pointer; always there on touch, and while confirming.
              !confirming &&
                "md:pointer-events-none md:opacity-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100",
            )}
          >
            {confirming ? (
              <>
                <span className="text-xs text-muted-foreground">Delete this {noun}?</span>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
                <Button size="sm" variant="destructive" className="h-7" onClick={onDelete}>
                  Delete
                </Button>
              </>
            ) : (
              <>
                {canEdit && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Edit the ${noun}`} onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canDelete && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Delete the ${noun}`} onClick={() => setConfirming(true)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </header>
      {detail}
      {update.body && <UpdateText body={update.body} />}
    </article>
  )
}
