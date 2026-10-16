"use client"

/**
 * Your notification preferences (design v3, admin S2): email, the digest and
 * quiet hours. ONE save model, instant: each switch, checkbox and choice
 * saves the moment it changes and says "Saved" with the row's tick; the time
 * fields save 600ms after the last keystroke. The page used to say "Changes
 * here wait for Save" for this card while every other card on it saved at
 * once, with the Save far below.
 *
 * The server takes a partial update (only the fields sent change), so each
 * change sends just its own field. While a change is in flight it is laid
 * over the server's answer; when it holds, the answer is updated in place;
 * when it fails, the control springs back and the row says why. The Read
 * receipts card reads and updates this same answer.
 *
 * Email off for the person: the event rows stay where they are, dimmed and
 * disabled, under one line, so the page never jumps. Email off on the server
 * (no provider configured): said once, at the top; a request that FAILED is
 * not that, and says the load failed with Try again.
 *
 * At 720px and wider the events are a matrix: events down the side, a
 * column per channel the server stores per event. Today that is Email only
 * (the preference model has no per-event push or in-app flags), so the
 * matrix has one column; a channel gains a column when the server stores it.
 */

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import {
  SettingRow,
  SettingsCardError,
  SettingsList,
  SettingsRowsSkeleton,
  SettingsSection,
  SwitchRow,
} from "@/components/ui/settingsSection"
import { SavedTick, reasonOf, type SaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { browserTZ } from "@/lib/utils/timeZone"
import { AlertTriangle, Moon } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"

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
type Key = Exclude<keyof Preferences, "email_supported">

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

/** The events, in the order people think of them. */
export const EMAIL_EVENTS = [
  { key: "email_dms", label: "Direct messages", help: "A 1:1 chat, or a message in a group you're in." },
  { key: "email_mentions", label: "Mentions", help: "You're @-mentioned in a channel, post, comment or task." },
  { key: "email_task_assigned", label: "Task assignments", help: "A task is assigned to you." },
  { key: "email_task_status", label: "Task status changes", help: "A task you own or watch changes status." },
  { key: "email_comments", label: "Comments and replies", help: "On posts, docs, tasks or threads you're part of." },
  { key: "email_calls", label: "Calls", help: "A call starts in a channel or chat you're in." },
  { key: "email_channel_invites", label: "Channel and project invites", help: "You're added to a new space." },
] as const satisfies ReadonlyArray<{ key: Key; label: string; help: string }>

/**
 * The channels the server stores per event, as matrix columns. Push and in
 * app are not per event in the preference model yet: they get a column here
 * when it stores them.
 */
const DIGEST_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
] as const

const DIGEST_LINE: Record<Preferences["email_digest_frequency"], string> = {
  off: "No digest. The emails above still arrive as things happen.",
  daily: "Arrives each morning: overdue commitments and questions still waiting on you.",
  weekly: "Arrives on Mondays: the week's overdue commitments and questions still waiting on you.",
}

const TEXT_DEBOUNCE_MS = 600
const SAVED_MS = 1900

/** "HH:MM" as minutes since midnight, or null. */
const minutesOf = (hhmm: string | null) => {
  if (!hhmm || !/^\d{1,2}:\d{2}/.test(hhmm)) return null
  const [h, m] = hhmm.split(":").map(Number)
  return (h % 24) * 60 + (m % 60)
}

/** Minutes since midnight now, in a time zone (the browser's, if that one is unknown). */
function nowIn(tz: string | null): number {
  const d = new Date()
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz || undefined }).formatToParts(d)
    const h = Number(parts.find((p) => p.type === "hour")?.value)
    const m = Number(parts.find((p) => p.type === "minute")?.value)
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m
  } catch {
    /* an unknown zone: the browser's clock */
  }
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * The 24-hour bar: 240×24, the quiet span drawn in --press with a moon at its
 * start, and the current time as a 2px accent tick. A span past midnight is
 * drawn in two pieces.
 */
export function QuietHoursBar({ start, end, tz }: { start: string | null; end: string | null; tz: string | null }) {
  const s = minutesOf(start)
  const e = minutesOf(end)
  const now = nowIn(tz)
  const pct = (m: number) => (m / 1440) * 100
  const spans: Array<[number, number]> = s === null || e === null || s === e ? [] : s < e ? [[s, e]] : [[s, 1440], [0, e]]
  return (
    <div data-quiet-bar="" aria-hidden="true" className="you-qbar">
      {spans.map(([a, b], i) => (
        <span key={i} data-quiet-span="" className="you-qbar-span" style={{ left: `${pct(a)}%`, width: `${pct(b - a)}%` }} />
      ))}
      {s !== null && spans.length > 0 && <Moon className="you-qbar-moon" style={{ left: `min(calc(${pct(s)}% + 4px), calc(100% - 16px))` }} />}
      <span data-now-tick="" className="you-qbar-now" style={{ left: `${pct(now)}%` }} />
    </div>
  )
}

/** Per-field save statuses, in the shape the rows take (saveStatus.tsx). */
function useFieldStatuses() {
  const [statuses, setStatuses] = useState<Partial<Record<Key, SaveStatus>>>({})
  const timers = useRef<Partial<Record<Key, number>>>({})
  useEffect(() => {
    const t = timers.current
    return () => Object.values(t).forEach((id) => window.clearTimeout(id))
  }, [])
  const set = useCallback((key: Key, state: SaveStatus["state"], error?: string) => {
    window.clearTimeout(timers.current[key])
    setStatuses((prev) => {
      const was = prev[key] ?? { state: "idle", failures: 0 }
      return { ...prev, [key]: { state, error, failures: state === "error" ? was.failures + 1 : was.failures } }
    })
    if (state === "saved") {
      timers.current[key] = window.setTimeout(
        () => setStatuses((prev) => ({ ...prev, [key]: { failures: prev[key]?.failures ?? 0, state: "idle" } })),
        SAVED_MS,
      )
    }
  }, [])
  return { statuses, set }
}

export function NotificationPreferencesCard() {
  const { data, isLoading, isError, mutate } = useFetch<FetchResponse>(GetEndpointUrl.GetNotificationPreferences)
  // Changes on their way to the server, laid over its answer. Only these are
  // kept here: the Read receipts card updates the same answer, and a copy of
  // the whole answer would throw its change away.
  const [pending, setPending] = useState<Partial<Preferences>>({})
  const { statuses, set } = useFieldStatuses()
  const debounce = useRef<Partial<Record<Key, number>>>({})
  const dataRef = useRef(data)
  dataRef.current = data
  useEffect(() => {
    const t = debounce.current
    return () => Object.values(t).forEach((id) => window.clearTimeout(id))
  }, [])

  const server = useMemo(() => (data?.data ? { ...DEFAULTS, ...data.data } : null), [data?.data])
  const working = useMemo<Preferences>(() => ({ ...(server ?? DEFAULTS), ...pending }), [server, pending])

  const send = useCallback(
    async (patch: Partial<Preferences>, statusKey: Key) => {
      set(statusKey, "saving")
      try {
        // The row says what went wrong itself, so the global toast stays quiet.
        await axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, patch, OWN_ERRORS)
        const now = dataRef.current
        if (now) await mutate({ ...now, data: { ...now.data, ...patch } }, { revalidate: false })
        set(statusKey, "saved")
      } catch (e) {
        set(statusKey, "error", reasonOf(e))
      } finally {
        setPending((prev) => {
          const next = { ...prev }
          for (const k of Object.keys(patch) as Key[]) if (next[k] === patch[k]) delete next[k]
          return next
        })
      }
    },
    [mutate, set],
  )

  /** A switch, checkbox or choice: saved at once. */
  const change = <K extends Key>(key: K, value: Preferences[K]) => {
    const patch: Partial<Preferences> = { [key]: value }
    // Turning quiet hours on with nothing set gives it a sensible night.
    if (key === "quiet_hours_enabled" && value === true) {
      if (!working.quiet_hours_start) patch.quiet_hours_start = "22:00"
      if (!working.quiet_hours_end) patch.quiet_hours_end = "07:00"
      if (!working.quiet_hours_tz) patch.quiet_hours_tz = browserTZ()
    }
    setPending((prev) => ({ ...prev, ...patch }))
    void send(patch, key)
  }

  /** A typed field (a time, the time zone): saved 600ms after the last change. */
  const type = (key: "quiet_hours_start" | "quiet_hours_end" | "quiet_hours_tz", value: string) => {
    setPending((prev) => ({ ...prev, [key]: value }))
    window.clearTimeout(debounce.current[key])
    debounce.current[key] = window.setTimeout(() => void send({ [key]: value }, key), TEXT_DEBOUNCE_MS)
  }

  // A failed request is not "email is off": it says so, and offers a retry.
  if (!server) {
    if (isError && !isLoading) {
      return (
        <SettingsSection id="notifications-email" title="Email" description="Which activity reaches your inbox.">
          <SettingsList>
            <SettingsCardError what="your notification settings" onRetry={() => void mutate()} />
          </SettingsList>
        </SettingsSection>
      )
    }
    return (
      <div role="status" aria-label="Loading your notification settings">
        <SettingsSection id="notifications-email" title="Email" description="Which activity reaches your inbox.">
          <SettingsList>
            <SettingsRowsSkeleton rows={4} />
          </SettingsList>
        </SettingsSection>
      </div>
    )
  }

  const supported = working.email_supported
  const masterOff = !supported || !working.email_enabled
  const timeStatus = [statuses.quiet_hours_start, statuses.quiet_hours_end].find((s) => s && s.state !== "idle")

  return (
    <div className="space-y-8">
      <SettingsSection id="notifications-email" title="Email" description="Which activity reaches your inbox. Saved as you change it.">
        {!supported && (
          <div role="status" className="you-note">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-hidden="true" />
            <p className="text-xs text-muted-foreground text-pretty">
              Your workspace admin hasn&apos;t turned email on yet. Push and in-app notifications still work.
            </p>
          </div>
        )}
        <SettingsList>
          <SwitchRow
            id="email_enabled"
            label="Email me about activity"
            description="When off, no notification email is sent at all."
            checked={working.email_enabled && supported}
            disabled={!supported}
            status={statuses.email_enabled}
            onChange={(v) => change("email_enabled", v)}
          />
          <div data-email-events="" data-off={masterOff ? "true" : undefined} className="you-events set-row !p-0">
            {masterOff && supported && (
              <p data-events-off="" className="px-4 pt-3 text-xs text-muted-foreground">
                Turned off for every email.
              </p>
            )}
            <div className={cn("you-events-body", masterOff && "opacity-50")}>
              {/* A switch per event on a computer and a phone alike: the
                  computer's was a one-column table of checkboxes (QA F-33). */}
              <div className="you-event-rows">
                {EMAIL_EVENTS.map((ev) => (
                  <SwitchRow
                    key={ev.key}
                    id={ev.key}
                    label={ev.label}
                    description={ev.help}
                    checked={working[ev.key]}
                    disabled={masterOff}
                    status={statuses[ev.key]}
                    onChange={(v) => change(ev.key, v)}
                  />
                ))}
              </div>
            </div>
          </div>
          <SwitchRow
            id="email_only_when_offline"
            label="Only when I'm away"
            description="Skip the email if you're active in OneCamp on any device."
            checked={working.email_only_when_offline}
            disabled={masterOff}
            status={statuses.email_only_when_offline}
            onChange={(v) => change("email_only_when_offline", v)}
          />
        </SettingsList>
      </SettingsSection>

      <SettingsSection id="notifications-digest" title="Digest" description="A summary of what's still open, from your meetings, channels and projects.">
        <SettingsList>
          <SettingRow
            label="Activity digest"
            controlId="digest"
            description={DIGEST_LINE[working.email_digest_frequency] ?? DIGEST_LINE.off}
            status={statuses.email_digest_frequency}
            disabled={masterOff}
          >
            <SegmentedControl
              id="digest"
              value={working.email_digest_frequency}
              onValueChange={(v) => change("email_digest_frequency", v)}
              disabled={masterOff}
              aria-label="Activity digest"
              aria-describedby="digest-desc"
              options={DIGEST_OPTIONS}
            />
          </SettingRow>
        </SettingsList>
      </SettingsSection>

      <SettingsSection
        id="notifications-quiet"
        title="Quiet hours"
        description="Push notifications and emails wait until quiet hours end. To go quiet right now, use Pause notifications in your profile menu."
      >
        <SettingsList>
          <SwitchRow
            id="quiet_hours_enabled"
            label="Hold notifications during quiet hours"
            checked={working.quiet_hours_enabled}
            status={statuses.quiet_hours_enabled}
            onChange={(v) => change("quiet_hours_enabled", v)}
          />
          {working.quiet_hours_enabled && (
            <div data-quiet-range="" className="set-row you-reveal space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <label htmlFor="qh_start" className="sr-only">
                  From
                </label>
                <Input
                  id="qh_start"
                  type="time"
                  className="you-time h-8"
                  value={working.quiet_hours_start || ""}
                  onChange={(e) => type("quiet_hours_start", e.target.value)}
                />
                <span aria-hidden="true" className="text-sm text-ink-3">
                  →
                </span>
                <label htmlFor="qh_end" className="sr-only">
                  Until
                </label>
                <Input
                  id="qh_end"
                  type="time"
                  className="you-time h-8"
                  value={working.quiet_hours_end || ""}
                  onChange={(e) => type("quiet_hours_end", e.target.value)}
                />
                <QuietHoursBar start={working.quiet_hours_start} end={working.quiet_hours_end} tz={working.quiet_hours_tz} />
                <SavedTick status={timeStatus} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="qh_tz" className="you-tz-label">
                  Time zone
                </label>
                <Input
                  id="qh_tz"
                  className="you-tz h-7"
                  placeholder={browserTZ()}
                  value={working.quiet_hours_tz || ""}
                  onChange={(e) => type("quiet_hours_tz", e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <SavedTick status={statuses.quiet_hours_tz} />
              </div>
              {(["quiet_hours_start", "quiet_hours_end", "quiet_hours_tz"] as const).map((k) =>
                statuses[k]?.state === "error" ? (
                  // Said once, by the tick beside the field; an alert said it again.
                  <p key={k} className="text-xs text-danger-ink">
                    Not saved. <span>{statuses[k]?.error}</span>
                  </p>
                ) : null,
              )}
            </div>
          )}
        </SettingsList>
      </SettingsSection>
    </div>
  )
}
