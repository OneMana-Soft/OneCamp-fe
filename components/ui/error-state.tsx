"use client"
import type * as React from "react"
import { AlertCircle, RefreshCw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotError } from "@/components/ui/graphics/spots"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * ErrorState — "this failed to load", which is NOT the same sentence as "there
 * is nothing here".
 *
 * 198 of the 212 useFetch call sites never look at isError. On a list surface
 * that has a real consequence: SWR leaves `data` undefined on failure, so
 * `items.length === 0` is true, and the page renders its empty state. The tables
 * page told a user "No tables yet — create a table to track anything" when the
 * request had actually 500'd. The app was asserting the user's work did not
 * exist. In a tool people keep their job in, that is the most alarming thing it
 * can say, and it is also a dead end — there is no retry, because as far as the
 * page knows nothing went wrong.
 *
 * So the fix is one component that says the true thing and offers the way out.
 * Built on EmptyState rather than beside it, the same way PrincipalTag is built
 * on Badge: the layout, spacing, tones and icon treatment are already decided
 * there, and an error is the same shape of moment — a surface with no content and
 * one thing to do about it.
 *
 * Tone is deliberately `muted`, not a red alarm. A failed list fetch is usually a
 * blip, and painting a full-width danger panel for something a retry fixes
 * teaches people to distrust the surface. The icon carries the meaning; the copy
 * carries the action.
 *
 * Retry goes through SWR's `mutate`, so it revalidates the same key the page is
 * already bound to — no parallel fetch path that could disagree with the cache.
 */
export function ErrorState({
  /** What failed, in the user's words: "tables", "your boards", "this channel". */
  subject,
  /**
   * SWR's mutate for the failed key. Omit only when there is genuinely nothing
   * to retry, which is rare enough to be worth a second look.
   */
  onRetry,
  /** Set while a retry is in flight, so the button cannot be double-fired. */
  retrying,
  className,
  compact,
  detail,
}: {
  subject: string
  onRetry?: () => void
  retrying?: boolean
  className?: string
  /**
   * Inside a section, under its title: half the padding, and the error spot at
   * 48px (the playful layer's drawing for errors) instead of a bare icon. Admin
   * sections each drew their own version of this: a red banner, an amber one, a
   * line of text, none with Try again.
   */
  compact?: boolean
  /**
   * The server's own reason ("You don't have permission to do that."), said in
   * place of the guess about the connection, which would then be wrong.
   */
  detail?: React.ReactNode
}) {
  return (
    <EmptyState
      icon={compact ? undefined : AlertCircle}
      illustration={compact ? <SpotError /> : undefined}
      title={`Couldn't load ${subject}`}
      // Names the likely cause and rules out the frightening one, because the
      // question a user actually has is "is my work gone?".
      description={detail ?? "Nothing has been lost. This is usually a connection problem: try again in a moment."}
      className={cn(compact && "py-6 [&_[data-empty-illustration]>svg]:size-12", className)}
      action={
        onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying} className="gap-1.5">
            <RefreshCw className={retrying ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {retrying ? "Retrying…" : "Try again"}
          </Button>
        ) : undefined
      }
    />
  )
}

