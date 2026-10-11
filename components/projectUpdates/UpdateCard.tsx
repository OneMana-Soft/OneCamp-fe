"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { HealthPill, HealthWord } from "@/components/projectUpdates/HealthPill"
import { healthColor } from "@/components/projectUpdates/healthTone"
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
  variant = "card",
  foot,
}: {
  update: CardUpdate
  now: number
  canEdit: boolean
  canDelete: boolean
  onEdit: () => void
  onDelete: () => void
  detail?: ReactNode
  noun?: string
  /**
   * "feature": the latest update, r16 on e1 with a 4 px band in its health's
   * colour (work.md W27). "rail": an older one, on the feed's rail with a dot
   * in its health's colour and the note clamped to three lines. "card": a
   * plain card (a goal's check-in).
   */
  variant?: "feature" | "card" | "rail"
  /** Under the note: "Since the last update: 4 done · 2 added · 1 late". */
  foot?: ReactNode
}) {
  const [confirming, setConfirming] = useState(false)
  const edited = Date.parse(update.updated_at) - Date.parse(update.created_at) > 60_000
  const [more, setMore] = useState(false)
  return (
    <article
      data-update-variant={variant}
      className={cn(
        "group relative",
        variant === "feature" && "overflow-hidden rounded-2xl bg-raised p-5 pt-6 shadow-e1 [animation:work-rise-in_240ms_var(--ease-out)_both]",
        variant === "card" && "rounded-xl bg-raised p-4 shadow-e1",
        variant === "rail" && "pb-5 pl-8",
      )}
    >
      {variant === "feature" && (
        <span aria-hidden="true" data-health-band="" className="absolute inset-x-0 top-0 h-1 origin-left [animation:work-grow-x_320ms_var(--ease-out)_both]" style={{ background: healthColor(update.health) }} />
      )}
      {variant === "rail" && (
        <span aria-hidden="true" data-rail-dot="" className="absolute left-[6px] top-[5px] size-2.5 rounded-full" style={{ background: healthColor(update.health), boxShadow: "0 0 0 3px var(--sheet)" }} />
      )}
      <header className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", variant === "rail" ? "mb-1" : "mb-3")}>
        {variant === "rail" ? null : variant === "feature" ? <HealthWord health={update.health} className="[&>span:last-child]:text-heading" /> : <HealthPill health={update.health} />}
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
                "md:pointer-events-none md:opacity-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-hover:pointer-events-auto md:group-hover:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
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
      {update.body &&
        (variant === "rail" ? (
          <>
            <UpdateText body={update.body} className={cn("text-ink-2", !more && "line-clamp-3")} />
            {!more && update.body.length > 240 && (
              <button type="button" onClick={() => setMore(true)} className="mt-1 text-xs font-medium text-ink-3 hover:text-foreground">
                More
              </button>
            )}
          </>
        ) : (
          <UpdateText body={update.body} className={variant === "feature" ? "text-body" : undefined} />
        ))}
      {foot && <div className="mt-3 text-xs text-ink-2">{foot}</div>}
    </article>
  )
}
