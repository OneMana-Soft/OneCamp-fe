"use client"

/**
 * Per-user email notification preferences. Reads /user/notificationPreferences,
 * lets the user toggle per-event flags + global on/off + quiet hours, and
 * saves diffs back to the same endpoint.
 *
 * When the backend reports email_supported=false (RESEND_API_KEY missing
 * on the server), the whole panel is shown but disabled with a clear
 * "your admin hasn't configured email yet" message.
 */

import { useEffect, useMemo, useState } from "react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils/helpers/cn"
import { SaveBar, SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
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


export function NotificationPreferencesCard() {
  const { data, isLoading, mutate } = useFetch<FetchResponse>(GetEndpointUrl.GetNotificationPreferences)
  const post = usePost()

  // Local working copy. Initialised from the server payload as soon as it
  // arrives. Saving diffs only — server's Update handler accepts a partial
  // shape so we only PATCH what changed.
  const [working, setWorking] = useState<Preferences>(DEFAULTS)
  const [original, setOriginal] = useState<Preferences>(DEFAULTS)

  useEffect(() => {
    if (data?.data) {
      const merged: Preferences = { ...DEFAULTS, ...data.data }
      // If user has quiet hours but no timezone yet, seed with browser TZ.
      if (merged.quiet_hours_enabled && !merged.quiet_hours_tz) {
        merged.quiet_hours_tz = browserTZ()
      }
      setWorking(merged)
      setOriginal(merged)
    }
  }, [data?.data])

  const dirty = useMemo(() => {
    return (Object.keys(working) as (keyof Preferences)[]).some(
      (k) => working[k] !== original[k]
    )
  }, [working, original])

  const setField = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setWorking((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (!dirty || post.isSubmitting) return
    // Build a partial payload of only changed fields so the server updates
    // exactly what the user touched.
    const diff: Partial<Preferences> = {}
    ;(Object.keys(working) as (keyof Preferences)[]).forEach((k) => {
      if (working[k] !== original[k]) {
        // server doesn't accept email_supported (read-only)
        if (k !== "email_supported") {
          ;(diff as any)[k] = working[k]
        }
      }
    })
    // If quiet hours just got enabled, default times so the user has
    // something sane without filling all fields.
    if (
      diff.quiet_hours_enabled === true &&
      !diff.quiet_hours_start &&
      !working.quiet_hours_start
    ) {
      diff.quiet_hours_start = "22:00"
    }
    if (
      diff.quiet_hours_enabled === true &&
      !diff.quiet_hours_end &&
      !working.quiet_hours_end
    ) {
      diff.quiet_hours_end = "07:00"
    }
    if (
      diff.quiet_hours_enabled === true &&
      !diff.quiet_hours_tz &&
      !working.quiet_hours_tz
    ) {
      diff.quiet_hours_tz = browserTZ()
    }

    await post.makeRequest({
      apiEndpoint: PostEndpointUrl.UpdateNotificationPreferences,
      payload: diff,
      showToast: true,
    })
    setOriginal({ ...working, ...diff } as Preferences)
    mutate()
  }

  const supported = working.email_supported
  const masterOff = !supported || !working.email_enabled
  const discard = () => setWorking(original)

  return (
    <div className="space-y-10">
      {!supported && !isLoading && (
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
            disabled={!supported || isLoading || post.isSubmitting}
            onChange={(v) => setField("email_enabled", v)}
          />
        </SettingsList>
        <SettingsList>
          <SwitchRow
            label="Direct messages"
            description="When someone sends you a 1:1 chat or messages a group you're in."
            checked={working.email_dms}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_dms", v)}
          />
          <SwitchRow
            label="Mentions"
            description="When you're @-mentioned in a channel, post, comment or task."
            checked={working.email_mentions}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_mentions", v)}
          />
          <SwitchRow
            label="Task assignments"
            description="When a task is assigned to you."
            checked={working.email_task_assigned}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_task_assigned", v)}
          />
          <SwitchRow
            label="Task status changes"
            description="When the status of a task you own or watch changes."
            checked={working.email_task_status}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_task_status", v)}
          />
          <SwitchRow
            label="Comments and replies"
            description="On posts, docs, tasks or chat threads you're part of."
            checked={working.email_comments}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_comments", v)}
          />
          <SwitchRow
            label="Calls"
            description="When a video call starts in a channel or chat you're in."
            checked={working.email_calls}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_calls", v)}
          />
          <SwitchRow
            label="Channel and project invites"
            description="When you're added to a new space."
            checked={working.email_channel_invites}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_channel_invites", v)}
          />
        </SettingsList>
        <SettingsList>
          <SwitchRow
            label="Only when I'm away"
            description="Skip the email if you're already active in OneCamp on any device."
            checked={working.email_only_when_offline}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_only_when_offline", v)}
          />
        </SettingsList>

        {/* A choice of one, so a group of radio-like toggles rather than three primary buttons. */}
        <div className="space-y-2 pt-2">
          <p id="digest-label" className="text-sm font-medium">Activity digest</p>
          <div role="radiogroup" aria-labelledby="digest-label" className="inline-flex gap-1 rounded-md bg-muted p-1">
            {(["off", "daily", "weekly"] as const).map((opt) => {
              const on = working.email_digest_frequency === opt
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={masterOff || isLoading}
                  onClick={() => setField("email_digest_frequency", opt)}
                  className={cn(
                    "h-8 rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-50",
                    on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt === "off" ? "Off" : opt === "daily" ? "Daily" : "Weekly"}
                </button>
              )
            })}
          </div>
          <p className="max-w-[65ch] text-xs text-muted-foreground text-pretty">
            A summary of your open items: overdue commitments and unanswered questions OneCamp&apos;s AI picked up from
            your meetings, channels and projects. Weekly digests arrive on Mondays.
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Quiet hours"
        description="Push notifications and emails wait until quiet hours end, in your time zone. To go quiet right now, use Pause notifications in your profile menu."
      >
        <SettingsList>
          <SwitchRow
            label="Hold notifications during quiet hours"
            checked={working.quiet_hours_enabled}
            disabled={isLoading}
            onChange={(v) => setField("quiet_hours_enabled", v)}
          />
          {working.quiet_hours_enabled && (
            <div className="grid grid-cols-1 gap-3 px-4 py-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="qh_start">From</Label>
                <Input
                  id="qh_start"
                  type="time"
                  value={working.quiet_hours_start || ""}
                  onChange={(e) => setField("quiet_hours_start", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qh_end">Until</Label>
                <Input
                  id="qh_end"
                  type="time"
                  value={working.quiet_hours_end || ""}
                  onChange={(e) => setField("quiet_hours_end", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qh_tz">Time zone</Label>
                <Input
                  id="qh_tz"
                  placeholder={browserTZ()}
                  value={working.quiet_hours_tz || ""}
                  onChange={(e) => setField("quiet_hours_tz", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          )}
        </SettingsList>
      </SettingsSection>

      <SaveBar
        dirty={dirty}
        saving={post.isSubmitting}
        onSave={() => void handleSave()}
        onDiscard={discard}
        what="email and quiet-hours changes"
      />
    </div>
  )
}
