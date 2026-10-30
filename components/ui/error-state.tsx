"use client"
import type * as React from "react"
import { RefreshCw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotError } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"
import { useSaysLoadFailure } from "@/lib/http/loadFailure"

/**
 * "This failed to load", never "there is nothing here": a list whose fetch
 * failed has no data, so it drew its empty state ("No tables yet" on a 500)
 * with no way to retry. On EmptyState's layout, muted rather than an alarm,
 * as a retry usually fixes it; Retry is SWR's mutate on the page's own key.
 */
export function ErrorState({
  /** What failed, in the user's words: "tables", "your boards", "this channel". */
  subject,
  /** SWR's mutate for the failed key; omit only when nothing can be retried. */
  onRetry,
  /** Set while a retry is in flight, so it can't be fired twice. */
  retrying,
  className,
  compact,
  detail,
}: {
  subject: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
  /** Inside a section, under its title: half the padding, the spot at 48px. */
  compact?: boolean
  /** The server's own reason ("You don't have permission to do that."), said in place of the guess about the connection. */
  detail?: React.ReactNode
}) {
  // Said here, so the request's toast stays quiet (lib/http/loadFailure).
  useSaysLoadFailure()
  return (
    <EmptyState
      // The app's one error mark, as on the crash screens.
      illustration={<SpotError />}
      title={`Couldn't load ${subject}`}
      // Names the likely cause and rules out the frightening one: "is my work gone?".
      description={detail ?? "Nothing has been lost. This is usually a connection problem: try again in a moment."}
      className={cn(compact && "py-6 [&_[data-empty-illustration]>svg]:size-12", className)}
      action={tryAgain(onRetry, retrying)}
    />
  )
}

export const tryAgain = (onRetry?: () => void, retrying?: boolean) =>
  onRetry && (
    <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="gap-1.5">
      <RefreshCw className={retrying ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {retrying ? "Retrying…" : "Try again"}
    </Button>
  )

