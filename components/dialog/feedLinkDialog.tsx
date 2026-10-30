"use client"

/**
 * A secret link of a person's own that Google Calendar, Apple Calendar or
 * Outlook reads: a calendar (calendar B8) or a project's cycles (linear-12).
 * The server keeps only its hash, so the link is shown once, when it is made;
 * a new link stops the old one at once, and Stop ends it. One dialog for
 * every such link, so they read and behave alike; a sheet on a phone.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { CopyLinkButton } from "@/components/dialog/shareParts"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { busyWith } from "@/lib/ui/busyWith"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { shortDate } from "@/lib/utils/date/shortDate"

/** A person's link as its read answers: the address only when just made. */
export interface FeedLink {
  live: boolean
  url?: string
  created_at?: string
}

type Action = "make" | "stop"

const FAILED: Record<Action, string> = {
  make: "The link couldn't be made. Try again.",
  stop: "The link couldn't be stopped. Try again.",
}

/**
 * The person's link read from `url` ("" while it isn't known which), shown as
 * a make or a stop answered it until the read catches up, and the action
 * under way.
 */
export function useFeedLink<L extends FeedLink>(url: string) {
  const read = useFetch<{ data?: L }>(url, undefined, undefined, OWN_ERRORS)
  const [answered, setAnswered] = React.useState<L | null>(null)
  const [running, setRunning] = React.useState<Action | null>(null)
  const [error, setError] = React.useState("")
  const run = async (action: Action, call: () => Promise<L>) => {
    setRunning(action)
    setError("")
    try {
      setAnswered(await call())
      void read.mutate()
    } catch (err) {
      setError(apiErrorMessage(err, FAILED[action]))
    } finally {
      setRunning(null)
    }
  }
  return {
    read,
    link: answered ?? read.data?.data,
    // Nothing is made before the read says whether a link is live: making one
    // would stop it unasked.
    known: answered !== null || read.data !== undefined,
    running,
    error,
    run,
  }
}

type FeedLinkState<L extends FeedLink> = ReturnType<typeof useFeedLink<L>>

export function FeedLinkDialog<L extends FeedLink>({
  feed,
  title,
  description,
  linkName,
  subject,
  showing,
  make,
  stop,
  onClose,
  children,
  ...data
}: {
  feed: FeedLinkState<L>
  title: string
  description: string
  /** The link field's name: "The calendar's link". */
  linkName: string
  /** What a failed read couldn't load: "the calendar's link". */
  subject: string
  /** What the live link shows, where that is a choice: "everything". */
  showing?: string
  make: () => Promise<L>
  /** Ends the link, answering it as it then is. */
  stop: () => Promise<L>
  onClose: () => void
  /** A choice over what a new link shows, above it. */
  children?: React.ReactNode
} & { [data: `data-${string}`]: string }) {
  const confirm = useConfirm()
  const { read, link, known, running, error, run } = feed
  const live = !!link?.live
  // A new link stops the live one for every app that reads it, so it asks first.
  const makeNew = () =>
    live
      ? confirm({
          title: "Make a new link?",
          description: "The link you have stops at once: calendar apps stop updating from it until they're given the new one.",
          confirmText: "Make a new link",
          destructive: true,
          onConfirm: () => run("make", make),
        })
      : void run("make", make)
  const making = busyWith(running, "make")
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" {...data}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <OverlayBody className="grid gap-4">
          {children}
          {link?.url ? (
            <div className="grid gap-1.5" data-feed-link="">
              <div className="flex items-center gap-2">
                {/* The link is longer than the field: it ends in a fade, not a cut glyph,
                    on a ground of its own so the fade takes only the text. Focused, it
                    is all selected and shown whole. */}
                <span className="flex h-8 min-w-0 flex-1 rounded-lg bg-sunken" data-feed-field="">
                  <input
                    readOnly
                    value={link.url}
                    aria-label={linkName}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 font-mono text-meta text-ink outline-none [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] focus:[mask-image:none] focus-visible:focus-halo"
                  />
                </span>
                <CopyLinkButton href={link.url} label="Copy" />
              </div>
              <p className="text-meta text-ink-3">This is the only time it&apos;s shown: copy it now. A new link stops this one at once.</p>
            </div>
          ) : live ? (
            <p className="text-ui-sm text-ink-2" data-feed-live="">
              You have a link{link?.created_at ? ` from ${shortDate(new Date(link.created_at), new Date())}` : ""}
              {showing ? `, showing ${showing}` : ""}. It was shown once; make a new one to copy it again.
            </p>
          ) : known ? (
            <p className="text-ui-sm text-ink-2" data-feed-none="">
              No link yet.
            </p>
          ) : read.isError ? (
            <ErrorState compact subject={subject} onRetry={() => void read.mutate()} />
          ) : (
            // The line "No link yet." or the live link's will take, so the body doesn't jump when the read lands.
            <div role="status" aria-label="Reading your link" className="flex h-4.5 items-center" data-feed-reading="">
              <Skeleton className="h-3 w-56 max-w-full rounded" />
            </div>
          )}
          {error ? (
            <p role="alert" className="text-meta text-danger-ink">
              {error}
            </p>
          ) : null}
        </OverlayBody>
        <DialogFooter>
          {link?.url ? (
            // Just made: copied from the body, then done.
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          ) : (
            <>
              {live ? (
                <Button type="button" variant="ghost" className="text-danger-ink" onClick={() => void run("stop", stop)} {...busyWith(running, "stop")}>
                  Stop the link
                </Button>
              ) : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              )}
              <Button type="button" onClick={makeNew} busy={making.busy} disabled={making.disabled || !known}>
                {live ? "Make a new link" : "Make a link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
