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

import React, { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Bell, Mail, Save, Moon } from "@/lib/icons"
import { useFetch } from "@/hooks/useFetch"
import { usePost } from "@/hooks/usePost"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

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

// Display IANA timezones the browser exposes (small reasonable set used
// when the runtime doesn't expose the full Intl supportedValuesOf).
function detectBrowserTZ(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
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
        merged.quiet_hours_tz = detectBrowserTZ()
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
      diff.quiet_hours_tz = detectBrowserTZ()
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

  return (
    <Card className="w-full border-none shadow-none bg-transparent">
      <CardHeader className="px-0 pt-0 pb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-primary/10 p-1.5 rounded-md">
            <Bell className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-xl font-bold tracking-tight">Email notifications</CardTitle>
        </div>
        <CardDescription className="text-sm text-muted-foreground">
          Pick which OneCamp activity should reach your inbox. Realtime in-app and push
          notifications stay on regardless of these settings.
        </CardDescription>
      </CardHeader>

      <CardContent className="px-0 space-y-6">
        {!supported && !isLoading && (
          <div className="text-sm rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/40 p-3 text-amber-900 dark:text-amber-100">
            Your workspace admin hasn't enabled email yet. Push and in-app
            notifications still work as expected.
          </div>
        )}

        {/* Master switch */}
        <div className="flex items-center justify-between rounded-lg border bg-card/50 p-4">
          <div className="space-y-0.5">
            <Label htmlFor="email_enabled" className="text-sm font-semibold flex items-center gap-2">
              <Mail className="h-4 w-4" /> Email me about activity
            </Label>
            <p className="text-xs text-muted-foreground">
              Master switch. Disabling this stops all notification emails.
            </p>
          </div>
          <Switch
            id="email_enabled"
            checked={working.email_enabled && supported}
            disabled={!supported || isLoading || post.isSubmitting}
            onCheckedChange={(v) => setField("email_enabled", v)}
          />
        </div>

        {/* Per-event toggles */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">What to email me about</h3>
          <div className="space-y-2">
            <ToggleRow
              label="Direct messages"
              description="When someone sends you a 1:1 chat or messages a group you're in."
              checked={working.email_dms}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_dms", v)}
            />
            <ToggleRow
              label="Mentions"
              description="When you're @-mentioned in a channel, post, comment, or task."
              checked={working.email_mentions}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_mentions", v)}
            />
            <ToggleRow
              label="Task assignments"
              description="When a task is assigned to you."
              checked={working.email_task_assigned}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_task_assigned", v)}
            />
            <ToggleRow
              label="Task status changes"
              description="When the status of a task you own or watch changes."
              checked={working.email_task_status}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_task_status", v)}
            />
            <ToggleRow
              label="Comments and replies"
              description="On posts, docs, tasks, or chat threads you're part of."
              checked={working.email_comments}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_comments", v)}
            />
            <ToggleRow
              label="Calls"
              description="When a video call starts in a channel or chat you're in."
              checked={working.email_calls}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_calls", v)}
            />
            <ToggleRow
              label="Channel and project invites"
              description="When you're added to a new space."
              checked={working.email_channel_invites}
              disabled={masterOff || isLoading}
              onChange={(v) => setField("email_channel_invites", v)}
            />
          </div>
        </div>

        <Separator />

        {/* Smart delivery */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">Smart delivery</h3>
          <ToggleRow
            label="Only email me when I'm offline"
            description="Skip the inbox if I'm already active in OneCamp on any device."
            checked={working.email_only_when_offline}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("email_only_when_offline", v)}
          />
        </div>

        <Separator />

        {/* Quiet hours */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Moon className="h-4 w-4" /> Quiet hours
          </h3>
          <ToggleRow
            label="Defer non-urgent emails during my quiet window"
            description="Emails are held until quiet hours end, in your timezone."
            checked={working.quiet_hours_enabled}
            disabled={masterOff || isLoading}
            onChange={(v) => setField("quiet_hours_enabled", v)}
          />
          {working.quiet_hours_enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-md border p-3">
              <div className="space-y-1">
                <Label htmlFor="qh_start" className="text-xs">Start (HH:MM)</Label>
                <Input
                  id="qh_start"
                  placeholder="22:00"
                  value={working.quiet_hours_start || ""}
                  onChange={(e) => setField("quiet_hours_start", e.target.value)}
                  disabled={masterOff}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qh_end" className="text-xs">End (HH:MM)</Label>
                <Input
                  id="qh_end"
                  placeholder="07:00"
                  value={working.quiet_hours_end || ""}
                  onChange={(e) => setField("quiet_hours_end", e.target.value)}
                  disabled={masterOff}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qh_tz" className="text-xs">Timezone (IANA)</Label>
                <Input
                  id="qh_tz"
                  placeholder={detectBrowserTZ()}
                  value={working.quiet_hours_tz || ""}
                  onChange={(e) => setField("quiet_hours_tz", e.target.value)}
                  disabled={masterOff}
                />
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Digest */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Activity digest</h3>
          <div className="flex flex-wrap gap-2">
            {(["off", "daily", "weekly"] as const).map((opt) => (
              <Button
                key={opt}
                variant={working.email_digest_frequency === opt ? "default" : "outline"}
                size="sm"
                disabled={masterOff || isLoading}
                onClick={() => setField("email_digest_frequency", opt)}
              >
                {opt === "off" ? "Off" : opt[0].toUpperCase() + opt.slice(1)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A periodic summary of your open items — overdue commitments and unresolved
            questions OneCamp&apos;s AI captured from your meetings, channels, and projects.
            Weekly digests arrive on Mondays.
          </p>
        </div>

        <div className="flex justify-end pt-4">
          <Button
            onClick={handleSave}
            disabled={!dirty || isLoading || post.isSubmitting}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ToggleRow(props: {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border bg-card/50 p-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{props.label}</Label>
        {props.description && (
          <p className="text-xs text-muted-foreground">{props.description}</p>
        )}
      </div>
      <Switch
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
    </div>
  )
}
