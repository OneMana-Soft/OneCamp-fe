"use client"

/**
 * A secret link of a person's own that Google Calendar, Apple Calendar or
 * Outlook reads: a calendar (calendar B8) or a project's cycles (linear-12).
 * The server keeps only its hash, so the link is shown once, when it is made;
 * a new link stops the old one at once, and Stop ends it. One dialog for
 * every such link, so they read and behave alike; a sheet on a phone. A
 * link a workspace admin stopped says who stopped it and when (basecamp-05).
 * With links turned off for the workspace (calendar.feeds.allowed), the
 * link's read says so, and the dialog says so too and offers nothing to make
 * or copy, before anything is pressed.
 */

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OverlayBody } from "@/components/ui/overlay"
import { Button } from "@/components/ui/button"
import { CopyLinkButton } from "@/components/dialog/shareParts"
import { Key } from "@/lib/icons"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useConfirm } from "@/hooks/useConfirm"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { busyWith } from "@/lib/ui/busyWith"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { displayNameOf, type PersonNameFields } from "@/lib/personName"
import { shortDate } from "@/lib/utils/date/shortDate"

/** A person's link as its read answers: the address only when just made. */
export interface FeedLink {
  live: boolean
  url?: string
  created_at?: string
  /** Who stopped the last link, when a workspace admin did and none is live since. */
  stopped_by?: PersonNameFields
  stopped_at?: string
  /**
   * False when the workspace has turned links off (calendar.feeds.allowed):
   * nothing can be made or copied. Every read says so; absent reads as allowed.
   */
  links_allowed?: boolean
}

type Action = "make" | "stop"

/** Whether a link's read says the workspace has turned links off: the one place the dialog learns it. */
const linksOff = (answer: { data?: FeedLink } | undefined) => answer?.data?.links_allowed === false

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
  // An answer or a failure belongs to the link it was for: one dialog may show
  // another link (your calendar's, then everything you can see).
  const [answered, setAnswered] = React.useState<{ url: string; link: L } | null>(null)
  const [running, setRunning] = React.useState<Action | null>(null)
  const [error, setError] = React.useState({ url: "", text: "" })
  const run = async (action: Action, call: () => Promise<L>) => {
    setRunning(action)
    setError({ url, text: "" })
    try {
      setAnswered({ url, link: await call() })
      void read.mutate()
    } catch (err) {
      // A refused make (400) may be an admin turning links off while the dialog
      // was open: the link is read again, and the read says so, not the words.
      if (action === "make" && apiErrorStatus(err) === 400 && linksOff(await read.mutate())) return
      setError({ url, text: apiErrorMessage(err, FAILED[action]) })
    } finally {
      setRunning(null)
    }
  }
  const mine = answered?.url === url ? answered.link : null
  return {
    read,
    link: mine ?? read.data?.data,
    // Nothing is made before the read says whether a link is live: making one
    // would stop it unasked.
    known: mine !== null || read.data !== undefined,
    running,
    error: error.url === url ? error.text : "",
    // Links are off for the whole workspace, so nothing is offered to make or copy.
    off: linksOff(read.data),
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
  const { read, link, known, running, error, off, run } = feed
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
          {off ? null : children}
          {off ? (
            <p className="text-ui-sm text-ink-2" data-feed-off="">
              Links to other apps are off for this workspace: none can be made, and links made before show nothing. A workspace admin can turn them on
              again.
            </p>
          ) : link?.url ? (
            <div className="grid gap-1.5" data-feed-link="">
              <div className="flex items-center gap-2">
                {/* The link is longer than the field: it ends in a fade, not a cut glyph,
                    on a ground of its own so the fade takes only the text. Focused, it
                    is all selected and shown whole. It takes the room the button
                    leaves (w-0: the input's own width never widens the row past
                    the sheet, so Copied stays whole on a phone). */}
                <span className="flex h-8 w-0 min-w-0 flex-1 rounded-lg bg-sunken" data-feed-field="">
                  <input
                    readOnly
                    value={link.url}
                    aria-label={linkName}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 rounded-lg bg-transparent px-2 font-mono text-meta text-ink outline-none [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)] focus:[mask-image:none] focus-visible:focus-halo"
                  />
                </span>
                {/* A key, not the share chain: this is a secret, never a page to pass on. */}
                <CopyLinkButton href={link.url} label="Copy" icon={Key} className="shrink-0" />
              </div>
              <p className="text-meta text-ink-3">
                <span className="font-medium text-ink-2">Keep it to yourself.</span> This is the only time it&apos;s shown: copy it
                now. A new link stops this one at once.
              </p>
            </div>
          ) : live ? (
            <p className="text-ui-sm text-ink-2" data-feed-live="">
              You have a link{link?.created_at ? ` from ${shortDate(new Date(link.created_at), new Date())}` : ""}
              {showing ? `, showing ${showing}` : ""}. It was shown once; make a new one to copy it again.
            </p>
          ) : known && link?.stopped_by ? (
            <p className="text-ui-sm text-ink-2" data-feed-stopped="">
              {displayNameOf(link.stopped_by) || "A workspace admin"} stopped this link
              {link.stopped_at ? ` on ${shortDate(new Date(link.stopped_at), new Date())}` : ""}. Make a new one to show it again.
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
              ) : off ? null : (
                <Button type="button" variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              )}
              {off ? (
                <Button type="button" onClick={onClose}>
                  Done
                </Button>
              ) : (
                <Button type="button" onClick={makeNew} busy={making.busy} disabled={making.disabled || !known}>
                  {live ? "Make a new link" : "Make a link"}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
