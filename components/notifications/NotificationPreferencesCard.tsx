"use client"

/**
 * Per-user email notification preferences. Reads /user/notificationPreferences,
 * lets the user toggle per-event flags + global on/off + quiet hours, and
 * saves what changed back to the same endpoint when they press Save.
 *
 * When the backend reports email_supported=false (RESEND_API_KEY missing
 * on the server), the whole panel is shown but disabled with a clear
 * "your admin hasn't configured email yet" message. A request that FAILED is
 * not that: it says the load failed and offers to try again.
 */

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { SaveBar, SettingRow, SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useFetch } from "@/hooks/useFetch"
import { toast } from "@/hooks/use-toast"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"

type Preferences = {
  email_supported: boolean
  email_enabled: boolean
  email_mentions: boolean
  email_dms: boolean
  email_task_assigned: boolean
  email_task_status: boolean
  email_comments: boolean
  email_calls: boolean
  email_channel_invites: boolean
  email_only_when_offline: boolean
  email_digest_frequency: "off" | "daily" | "weekly"
  quiet_hours_enabled: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  quiet_hours_tz: string | null
}

type FetchResponse = { data: Preferences; status: string }

const DIGEST_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const

/**
 * The quiet-hours controls: one width, so From, Until and the time zone start
 * on one line down the list (they were w-36, w-36 and w-56), and the input's
 * own height, the list's one height (the digest's segmented control is 36px).
 */
const QUIET_CONTROL = "w-48"

/** What the person has changed and not saved yet, by field. */
type Edits = Partial<Preferences>

const DEFAULTS: Preferences = {
  email_supported: false,
  email_enabled: true,
  email_mentions: true,
  email_dms: true,
  email_task_assigned: true,
  email_task_status: true,
  email_comments: true,
  email_calls: true,
  email_channel_invites: true,
  email_only_when_offline: true,
  email_digest_frequency: "off",
  quiet_hours_enabled: false,
  quiet_hours_start: null,
  quiet_hours_end: null,
  quiet_hours_tz: null,
}


/** The server's answer as the card reads it: defaults filled in, and a time zone for quiet hours that have none. */
function fromServer(data: Partial<Preferences>): Preferences {
  const merged: Preferences = { ...DEFAULTS, ...data }
  // If user has quiet hours but no timezone yet, seed with browser TZ.
  if (merged.quiet_hours_enabled && !merged.quiet_hours_tz) {
    merged.quiet_hours_tz = browserTZ()
  }
  return merged
}

/** The rows' shape while the settings load, so nothing moves when they arrive. */
function LoadingRows({ rows }: { rows: number }) {
  return (
    <SettingsList>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-start justify-between gap-4 px-4 py-3" aria-hidden="true">
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-36" : "w-28")} />
            <Skeleton className={cn("h-3", i % 3 === 0 ? "w-3/4" : "w-2/3")} />
          </div>
          <Skeleton className="mt-0.5 h-5 w-9 shrink-0" />
        </div>
      ))}
    </SettingsList>
  )
}

export function NotificationPreferencesCard() {
  const { data, isLoading, isError, mutate } = useFetch<FetchResponse>(GetEndpointUrl.GetNotificationPreferences)
  const [saving, setSaving] = useState(false)

  // ONLY THE PERSON'S CHANGES ARE KEPT HERE; what is on screen is the server's
  // answer with them laid over it. The Read receipts card below reads and
  // updates this same answer, and saves the moment it is switched: when this
  // card kept a copy of the whole answer and re-copied it whenever the answer
  // changed, switching Read receipts wiped every unsaved change on the page,
  // and the save bar with them.
  const [edits, setEdits] = useState<Edits>({})
  const server = useMemo(() => (data?.data ? fromServer(data.data) : null), [data?.data])
  const working = useMemo<Preferences>(() => ({ ...(server ?? DEFAULTS), ...edits }), [server, edits])

  /** The fields whose value differs from what is saved: what Save would send. */
  const changed = useMemo(() => {
    const diff: Edits = {}
    if (!server) return diff
    ;(Object.keys(edits) as (keyof Preferences)[]).forEach((k) => {
      // server doesn't accept email_supported (read-only)
      if (k !== "email_supported" && edits[k] !== server[k]) (diff as Record<string, unknown>)[k] = edits[k]
    })
    return diff
  }, [edits, server])
  const dirty = Object.keys(changed).length > 0

  const setField = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!dirty || saving) return
    // Only changed fields, so the server updates exactly what the user touched.
    const diff: Edits = { ...changed }
    // If quiet hours just got enabled, default times so the user has
    // something sane without filling all fields.
    if (diff.quiet_hours_enabled === true && !diff.quiet_hours_start && !working.quiet_hours_start) {
      diff.quiet_hours_start = "22:00"
    }
    if (diff.quiet_hours_enabled === true && !diff.quiet_hours_end && !working.quiet_hours_end) {
      diff.quiet_hours_end = "07:00"
    }
    if (diff.quiet_hours_enabled === true && !diff.quiet_hours_tz && !working.quiet_hours_tz) {
      diff.quiet_hours_tz = browserTZ()
    }

    setSaving(true)
    try {
      // The card says what went wrong itself, so the global toast stays quiet
      // rather than showing a second message about the same failure.
      await axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, diff, OWN_ERRORS)
    } catch (e) {
      // The changes stay on screen, unsaved, for another try.
      toast({
        title: "Couldn't save your notification settings",
        description: apiErrorMessage(e, "Check your connection and try again."),
        variant: "destructive",
      })
      setSaving(false)
      return
    }
    // The saved values become the answer before the changes are let go, so the
    // switches do not flick back to the old values while it is fetched again.
    if (data) await mutate({ ...data, data: { ...data.data, ...diff } }, { revalidate: true })
    setEdits({})
    setSaving(false)
    toast({ title: "Notification settings saved" })
  }

  // A failed request is not "email is off": it says so, and offers a retry.
  if (!server) {
    if (isError && !isLoading) {
      return <ErrorState subject="your notification settings" onRetry={() => void mutate()} />
    }
    return (
      <div role="status" aria-label="Loading your notification settings" className="space-y-10">
        <SettingsSection title="Email" description="Which activity reaches your inbox. Changes here wait for Save.">
          <LoadingRows rows={1} />
          <LoadingRows rows={7} />
        </SettingsSection>
      </div>
    )
  }

  const supported = working.email_supported
  const masterOff = !supported || !working.email_enabled
  const discard = () => setEdits({})

  return (
    <div className="space-y-10">
      {!supported && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          Your workspace admin hasn&apos;t turned email on yet. Push and in-app notifications still work.
        </p>
      )}
      <SettingsSection
        title="Email"
        description="Which activity reaches your inbox. Changes here wait for Save."
      >
        <SettingsList>
          <SwitchRow
            label="Email me about activity"
            description="Turn this off to stop every notification email."
            checked={working.email_enabled && supported}
            disabled={!supported || saving}
            onChange={(v) => setField("email_enabled", v)}
          />
        </SettingsList>
        {/* The kinds, then when and how often, each under its own heading: the
            section was four bordered boxes in a row with nothing between them. */}
        <SettingsSection level={3} title="What you're emailed about" className="pt-3">
        <SettingsList>
          <SwitchRow
            label="Direct messages"
            description="When someone sends you a 1:1 chat or messages a group you're in."
            checked={working.email_dms}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_dms", v)}
          />
          <SwitchRow
            label="Mentions"
            description="When you're @-mentioned in a channel, post, comment or task."
            checked={working.email_mentions}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_mentions", v)}
          />
          <SwitchRow
            label="Task assignments"
            description="When a task is assigned to you."
            checked={working.email_task_assigned}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_task_assigned", v)}
          />
          <SwitchRow
            label="Task status changes"
            description="When the status of a task you own or watch changes."
            checked={working.email_task_status}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_task_status", v)}
          />
          <SwitchRow
            label="Comments and replies"
            description="On posts, docs, tasks or chat threads you're part of."
            checked={working.email_comments}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_comments", v)}
          />
          <SwitchRow
            label="Calls"
            description="When a video call starts in a channel or chat you're in."
            checked={working.email_calls}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_calls", v)}
          />
          <SwitchRow
            label="Channel and project invites"
            description="When you're added to a new space."
            checked={working.email_channel_invites}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_channel_invites", v)}
          />
        </SettingsList>
        </SettingsSection>
        <SettingsSection level={3} title="When and how often" className="pt-3">
        <SettingsList>
          <SwitchRow
            label="Only when I'm away"
            description="Skip the email if you're already active in OneCamp on any device."
            checked={working.email_only_when_offline}
            disabled={masterOff || saving}
            onChange={(v) => setField("email_only_when_offline", v)}
          />
          {/* A choice of one, as a radio group the arrow keys move through. */}
          <SettingRow
            label="Activity digest"
            controlId="digest"
            description="A summary of your open items: overdue commitments and unanswered questions OneCamp's AI picked up from your meetings, channels and projects. Weekly digests arrive on Mondays."
          >
            <SegmentedControl
              id="digest"
              value={working.email_digest_frequency}
              onValueChange={(v) => setField("email_digest_frequency", v)}
              disabled={masterOff || saving}
              aria-label="Activity digest"
              aria-describedby="digest-desc"
              options={DIGEST_OPTIONS}
            />
          </SettingRow>
        </SettingsList>
        </SettingsSection>
      </SettingsSection>

      <SettingsSection
        title="Quiet hours"
        description="Push notifications and emails wait until quiet hours end, in your time zone. To go quiet right now, use Pause notifications in your profile menu."
      >
        <SettingsList>
          <SwitchRow
            label="Hold notifications during quiet hours"
            checked={working.quiet_hours_enabled}
            disabled={saving}
            onChange={(v) => setField("quiet_hours_enabled", v)}
          />
          {/* Each time is a row of the list, its control at the row's end at
              the rows' one height: they were a three-column block at a
              spacing of its own. */}
          {working.quiet_hours_enabled && (
            <>
              <SettingRow label="From" controlId="qh_start">
                <Input
                  id="qh_start"
                  type="time"
                  className={QUIET_CONTROL}
                  value={working.quiet_hours_start || ""}
                  onChange={(e) => setField("quiet_hours_start", e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Until" controlId="qh_end">
                <Input
                  id="qh_end"
                  type="time"
                  className={QUIET_CONTROL}
                  value={working.quiet_hours_end || ""}
                  onChange={(e) => setField("quiet_hours_end", e.target.value)}
                />
              </SettingRow>
              <SettingRow label="Time zone" controlId="qh_tz" description="The clock your quiet hours follow.">
                <Input
                  id="qh_tz"
                  className={QUIET_CONTROL}
                  aria-describedby="qh_tz-desc"
                  placeholder={browserTZ()}
                  value={working.quiet_hours_tz || ""}
                  onChange={(e) => setField("quiet_hours_tz", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </SettingRow>
            </>
          )}
        </SettingsList>
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => void handleSave()}
        onDiscard={discard}
        what="email and quiet-hours changes"
      />
    </div>
  )
}
