"use client"

// Settings > Permissions (basecamp-05): every calendar link a member has made,
// for a workspace admin, newest first. A link shows a calendar, or everything
// its person sees, in Google Calendar, Apple Calendar or Outlook; an admin may
// stop any of them, and its person is told who stopped it and when. Never its
// address: the server keeps only a hash, and this list carries none.

import * as React from "react"

import { SettingsCard, SettingsCardError, SettingsRowsSkeleton, SettingsSection } from "@/components/ui/settingsSection"
import { SingleAvatar } from "@/components/groupedAvatar/singleAvatar"
import { Button } from "@/components/ui/button"
import { useFetch } from "@/hooks/useFetch"
import { useConfirm } from "@/hooks/useConfirm"
import { useToast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { displayNameOf } from "@/lib/personName"
import type { UserProfileDataInterface } from "@/types/user"
import { apiErrorMessage, apiErrorStatus } from "@/lib/utils/apiError"
import { agoOrDate } from "@/lib/utils/date/dateWords"

const FEEDS_URL = "/admin/calendar/feeds"

/** One member's link as the admin list answers it. */
interface FeedListing {
  id: string
  person: Pick<UserProfileDataInterface, "user_uuid" | "user_name" | "user_full_name" | "user_profile_object_key">
  target: "calendar" | "workspace"
  /** Its name only when the admin may see that calendar. */
  calendar?: { id: string; kind: string; name?: string }
  scope: "busy" | "full"
  created_at: string
  last_read_at?: string
}

/** A calendar the admin may not see, named by its kind. */
const KIND: Record<string, string> = {
  personal: "A personal calendar",
  project: "A project's calendar",
  channel: "A channel's calendar",
  team: "A team's calendar",
  external: "An imported calendar",
  subscribed: "A subscribed calendar",
}

function whichCalendar(f: FeedListing): string {
  if (f.target === "workspace") return "All calendars"
  return f.calendar?.name?.trim() || KIND[f.calendar?.kind ?? ""] || "A calendar"
}

function FeedRow({ feed, onGone }: { feed: FeedListing; onGone: () => void }) {
  const confirm = useConfirm()
  const { toast } = useToast()
  const name = displayNameOf(feed.person) || "Someone"
  const now = new Date()
  const stop = () =>
    confirm({
      title: `Stop ${name}'s link?`,
      description: `Calendar apps reading it stop updating at once. ${name} is told you stopped it and can make a new one.`,
      confirmText: "Stop link",
      destructive: true,
      onConfirm: async () => {
        try {
          await axiosInstance.delete(`${FEEDS_URL}/${encodeURIComponent(feed.id)}`, OWN_ERRORS)
          onGone()
          toast({ title: `${name}'s link is stopped` })
        } catch (e) {
          if (apiErrorStatus(e) === 404) {
            onGone()
            toast({ title: "That link was already stopped" })
          } else {
            toast({ title: "The link wasn't stopped", description: apiErrorMessage(e, "Try again in a moment."), variant: "destructive" })
          }
        }
      },
    })
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3" data-calendar-feed={feed.id}>
      <span className="size-7 shrink-0">
        {/* The shared avatar reads only a person's names and picture, which the listing carries. */}
        <SingleAvatar userInfo={feed.person as UserProfileDataInterface} size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-ui font-medium text-ink">{name}</p>
        <p className="text-meta text-ink-3">
          {whichCalendar(feed)} · {feed.scope === "busy" ? "When it's busy" : "Everything"} · Made {agoOrDate(new Date(feed.created_at), now)} ·{" "}
          {feed.last_read_at ? `Last read ${agoOrDate(new Date(feed.last_read_at), now)}` : "Never read"}
        </p>
      </div>
      {/* On a phone the action takes its own line under the name, so the name isn't squeezed. */}
      <div className="flex items-center max-sm:basis-full max-sm:pl-10">
        <Button variant="ghost" size="sm" className="text-danger-ink hover:text-danger-ink" aria-label={`Stop ${name}'s link`} onClick={stop}>
          Stop
        </Button>
      </div>
    </li>
  )
}

export default function CalendarFeedsCard() {
  const feeds = useFetch<{ data?: { feeds?: FeedListing[]; more?: boolean } }>(FEEDS_URL, undefined, undefined, OWN_ERRORS)
  // Stopped here: gone from the list at once, without reading all of it again.
  const [gone, setGone] = React.useState<ReadonlySet<string>>(() => new Set())
  const list = (feeds.data?.data?.feeds ?? []).filter((f) => !gone.has(f.id))
  let body: React.ReactNode
  if (!feeds.data && !feeds.isError) {
    body = (
      <SettingsCard aria-label="Loading the calendar links">
        <SettingsRowsSkeleton rows={2} control="button" />
      </SettingsCard>
    )
  } else if (!feeds.data) {
    body = (
      <SettingsCard>
        <SettingsCardError what="the calendar links" onRetry={() => void feeds.mutate()} />
      </SettingsCard>
    )
  } else if (!list.length) {
    body = (
      <SettingsCard>
        <p className="px-4 py-3 text-ui text-ink-2" data-calendar-feeds-empty="">
          No one has a calendar link yet.
        </p>
      </SettingsCard>
    )
  } else {
    body = (
      <SettingsCard>
        <ul className="divide-y divide-line">
          {list.map((f) => (
            <FeedRow key={f.id} feed={f} onGone={() => setGone((g) => new Set(g).add(f.id))} />
          ))}
        </ul>
        {feeds.data.data?.more ? <p className="border-t border-line px-4 py-2.5 text-meta text-ink-3">Showing the newest 500.</p> : null}
      </SettingsCard>
    )
  }
  return (
    <SettingsSection
      id="permissions-calendar-links"
      title="Calendar links"
      description="Links members made to show a calendar, or everything they see, in another app. Stopping one tells its person who stopped it."
    >
      {body}
    </SettingsSection>
  )
}
