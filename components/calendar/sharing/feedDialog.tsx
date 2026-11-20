"use client"

/**
 * A calendar in another app (calendar B8): a secret link of the person's own
 * that Google Calendar, Apple Calendar or Outlook reads to keep the calendar
 * up to date, showing when they're busy or everything. A chunk of its own,
 * opened from a calendar's menu or a phone's calendar options, on the shared
 * link dialog (components/dialog/feedLinkDialog.tsx). Opened for your own, it
 * offers one link to everything you can see (basecamp-05) on the same dialog.
 */

import * as React from "react"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { FeedLinkDialog, useFeedLink, type FeedLink } from "@/components/dialog/feedLinkDialog"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { useCalendarList } from "@/lib/calendar/calendarList"

type Scope = "busy" | "full"
/** Which of your links: your calendar's, or the one to everything you can see. */
type Target = "own" | "workspace"

/** A person's link to a calendar, as GET/PUT …/feed answer. */
interface Feed extends FeedLink {
  scope?: Scope
  most: Scope
}

const feedUrl = (id: string) => `/calendar/calendars/${encodeURIComponent(id)}/feed`
/** The server's name for the link to everything a member sees. */
const WORKSPACE = "workspace"

export default function FeedDialog({
  calendar,
  onClose,
}: {
  /** The calendar to show elsewhere; your own when none is named. */
  calendar?: { id: string; name: string }
  onClose: () => void
}) {
  const own = useCalendarList().find((c) => c.kind === "personal")
  // Only a member has a calendar of their own; a guest's or a bot's session is refused the link to everything.
  const offersAll = !calendar && !!own
  const [target, setTarget] = React.useState<Target>("own")
  const all = offersAll && target === "workspace"
  const id = all ? WORKSPACE : calendar?.id || own?.id || ""
  const feed = useFeedLink<Feed>(id ? feedUrl(id) : "")
  const most: Scope = feed.link?.most ?? "full"
  const [scope, setScope] = React.useState<Scope | null>(null)
  // Out of the box a link shows the least, when it's busy: it gets forwarded, and
  // Outlook's publishing starts there too. Everything is a choice someone makes.
  const chosen: Scope = most === "busy" ? "busy" : (scope ?? feed.link?.scope ?? "busy")
  const name = calendar?.name?.trim()
  return (
    <FeedLinkDialog
      feed={feed}
      title={calendar ? `Show “${name || "this calendar"}” in another app` : all ? "Show everything you can see in another app" : "Show your calendar in another app"}
      description={
        all
          ? "One link to your calendar, your projects' and every calendar shared with you, kept up to date in Google Calendar, Apple Calendar or Outlook. Anyone who has the link sees what it shows, so keep it to yourself."
          : "Google Calendar, Apple Calendar and Outlook read this link and keep the calendar up to date. Anyone who has the link sees what it shows, so keep it to yourself."
      }
      linkName={all ? "The link to everything you can see" : "The calendar's link"}
      subject={all ? "the link to everything you can see" : "the calendar's link"}
      showing={feed.link?.scope === "busy" ? "when it's busy" : "everything"}
      make={async () => (await axiosInstance.put(feedUrl(id), { scope: chosen }, OWN_ERRORS)).data.data as Feed}
      stop={async () => {
        await axiosInstance.delete(feedUrl(id), OWN_ERRORS)
        return { live: false, most }
      }}
      onClose={onClose}
      data-feed-dialog=""
    >
      {offersAll ? (
        <div className="grid gap-1.5">
          <span className="text-ui-sm font-medium text-ink" id="feed-target-label">
            A link to
          </span>
          <SegmentedControl<Target>
            className="justify-self-start"
            aria-labelledby="feed-target-label"
            value={target}
            onValueChange={setTarget}
            disabled={feed.running !== null}
            options={[
              { value: "own", label: "Your calendar" },
              { value: "workspace", label: "Everything you can see" },
            ]}
          />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <span className="text-ui-sm font-medium text-ink" id="feed-scope-label">
          The link shows
        </span>
        <SegmentedControl<Scope>
          className="justify-self-start"
          aria-labelledby="feed-scope-label"
          value={chosen}
          onValueChange={setScope}
          disabled={feed.running !== null}
          options={[
            { value: "busy", label: "When it's busy" },
            { value: "full", label: "Everything", disabled: most === "busy" },
          ]}
        />
        {most === "busy" ? <p className="text-meta text-ink-3">You see only when they&apos;re busy, so the link can show only that.</p> : null}
      </div>
    </FeedLinkDialog>
  )
}
