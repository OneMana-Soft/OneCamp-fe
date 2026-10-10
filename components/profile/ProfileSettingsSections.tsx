"use client"

// The parts of "your profile" that save the moment they change: how the app
// looks, the Google Calendar link, and the ways you sign in. One copy, used by
// the desktop dialog and the phone's profile page, which each carried their
// own (the phone's sat inside the profile's form, so the password form was a
// form inside a form).

import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Button } from "@/components/ui/button"
import { SegmentedControl } from "@/components/ui/segmentedControl"
import { Monitor, Moon, Sun } from "@/lib/icons"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { Skeleton } from "@/components/ui/skeleton"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useConfirm } from "@/hooks/useConfirm"
import { ColorThemePicker } from "@/components/activeTheme/ColorThemePicker"
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection"
import { TwoFactorSection } from "@/components/profile/TwoFactorSection"
import { PasskeySection } from "@/components/profile/PasskeySection"
import { SettingRow, SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Monitor },
] as const

/**
 * Light, dark or the device's own, and the accent. A choice of three, not a
 * dark-mode switch. A Radix radio group, so it keys as WAI-ARIA's radio group
 * does: one Tab stop (the chosen theme), and the arrow keys move to the next
 * theme and choose it.
 */
export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const choice = theme === "dark" || theme === "light" ? theme : "system"
  // Rows of a settings list, at the padding of the switch rows in the rest of
  // the profile: the theme and the accent were a loose block of their own.
  return (
    <SettingsSection title="Appearance" description="Changes as you pick, on this device.">
      <SettingsList>
        <SettingRow label="Theme" controlId="theme">
          <SegmentedControl
            id="theme"
            value={choice}
            onValueChange={setTheme}
            aria-label="Theme"
            options={THEMES}
          />
        </SettingRow>
        {/* The accent picker carries its own label over its swatches. */}
        <div className="px-4 py-3">
          <ColorThemePicker />
        </div>
      </SettingsList>
    </SettingsSection>
  )
}

type CalendarStatus = { isConnected: boolean; taskSyncEnabled: boolean }

/**
 * Connect, disconnect (asked first), and whether task due dates go onto the calendar.
 *
 * A status that couldn't be read is said as such. It used to read as "Not
 * connected" with a Connect button, which started a second Google sign-in for
 * a calendar that was already linked. And each of the three actions says when
 * it fails, under the row, with the server's reason; they used to tell only
 * the console.
 */
export function CalendarSection() {
  const confirm = useConfirm()
  // null while it loads, "failed" when it couldn't be read.
  const [status, setStatus] = useState<CalendarStatus | null | "failed">(null)
  const [updatingSync, setUpdatingSync] = useState(false)
  const [problem, setProblem] = useState("")

  const load = useCallback(() => {
    setStatus(null)
    axiosInstance
      .get(GetEndpointUrl.GoogleCalendarStatus, OWN_ERRORS)
      .then((response) => setStatus(response.data?.data ?? { isConnected: false, taskSyncEnabled: false }))
      .catch(() => setStatus("failed"))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const say = (what: string, e: unknown) => setProblem(`${what} ${apiErrorMessage(e, "Check your connection and try again.")}`)

  const connect = async () => {
    setProblem("")
    try {
      const response = await axiosInstance.get(GetEndpointUrl.GoogleCalendarAuthUrl, OWN_ERRORS)
      if (response.data?.data) window.location.href = response.data.data
    } catch (e) {
      say("Couldn't start connecting Google Calendar.", e)
    }
  }

  const disconnect = () =>
    confirm({
      title: "Disconnect Google Calendar?",
      description: "OneCamp stops putting your task due dates on your calendar. You can connect it again any time.",
      confirmText: "Disconnect calendar",
      destructive: true,
      onConfirm: async () => {
        setProblem("")
        try {
          await axiosInstance.post(PostEndpointUrl.GoogleCalendarUnlink, undefined, OWN_ERRORS)
          setStatus({ isConnected: false, taskSyncEnabled: false })
        } catch (e) {
          say("Couldn't disconnect Google Calendar.", e)
        }
      },
    })

  const toggleSync = async (enabled: boolean) => {
    setUpdatingSync(true)
    setProblem("")
    try {
      await axiosInstance.post(PostEndpointUrl.UpdateGoogleCalendarSyncTask, { enabled }, OWN_ERRORS)
      setStatus((prev) => (prev && prev !== "failed" ? { ...prev, taskSyncEnabled: enabled } : prev))
    } catch (e) {
      say(enabled ? "Couldn't start putting due dates on your calendar." : "Couldn't stop putting due dates on your calendar.", e)
    } finally {
      setUpdatingSync(false)
    }
  }

  const loaded = status !== null && status !== "failed" ? status : null
  const connected = !!loaded?.isConnected
  return (
    <SettingsSection title="Google Calendar" description="Your OneCamp tasks on your own calendar.">
      <SettingsList>
        {status === null ? (
          <div role="status" aria-label="Checking your Google Calendar connection" className="flex items-center justify-between gap-6 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2 pt-0.5" aria-hidden="true">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-8 w-24 shrink-0" aria-hidden="true" />
          </div>
        ) : status === "failed" ? (
          <SettingRow
            label="Couldn't check your Google Calendar connection"
            description="Nothing has changed. This is usually a connection problem: try again in a moment."
            controlId="calendar-retry"
          >
            <Button id="calendar-retry" variant="outline" size="sm" type="button" onClick={load} aria-label="Try again">
              Try again
            </Button>
          </SettingRow>
        ) : (
          <SettingRow
            label={connected ? "Connected" : "Not connected"}
            description={connected ? "Disconnect to stop OneCamp writing to your calendar." : "Connect to see task due dates beside your meetings."}
            controlId="calendar-connect"
          >
            {/* Named for what it does, which the row's label is not. */}
            <Button
              id="calendar-connect"
              variant="outline"
              size="sm"
              type="button"
              aria-label={connected ? "Disconnect Google Calendar" : "Connect Google Calendar"}
              onClick={connected ? disconnect : () => void connect()}
            >
              {connected ? "Disconnect" : "Connect"}
            </Button>
          </SettingRow>
        )}
        {connected && (
          <SwitchRow
            label="Put task due dates on my calendar"
            checked={!!loaded?.taskSyncEnabled}
            disabled={updatingSync}
            onChange={(v) => void toggleSync(v)}
          />
        )}
      </SettingsList>
      {problem && (
        <p role="alert" className="text-sm text-danger-ink text-pretty">
          {problem}
        </p>
      )}
    </SettingsSection>
  )
}

/** Password, two-step verification and passkeys: each saves when its own step is finished. */
export function SigningInSection() {
  return (
    <SettingsSection title="Signing in" description="Each of these saves as soon as you finish it.">
      <SettingsList>
        <ChangePasswordSection />
        <TwoFactorSection />
        <PasskeySection />
      </SettingsList>
    </SettingsSection>
  )
}
