"use client"

// The parts of "your profile" that save the moment they change: how the app
// looks, the Google Calendar link, and the ways you sign in. One copy, used by
// the profile page and the phone's profile page.

import { useCallback, useEffect, useState } from "react"
import { useTheme } from "next-themes"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Button } from "@/components/ui/button"
import { Calendar, Check } from "@/lib/icons"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useConfirm } from "@/hooks/useConfirm"
import { useThemeConfig, VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme"
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection"
import { TwoFactorSection } from "@/components/profile/TwoFactorSection"
import { PasskeySection } from "@/components/profile/PasskeySection"
import { crossfadeGlow } from "@/components/profile/glowCrossfade"
import { SettingsCardError, SettingsList, SettingsRowsSkeleton, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { cn } from "@/lib/utils/helpers/cn"

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Device" },
] as const

/** A 160×100 miniature of the app in a mode: the frame, a sheet, two rows and a primary bar. */
function ThemeMiniature({ mode }: { mode: "light" | "dark" | "system" }) {
  return (
    <span aria-hidden="true" data-mode={mode} className="you-mini">
      <span className="you-mini-side" />
      <span className="you-mini-sheet">
        <span className="you-mini-line w-[70%]" />
        <span className="you-mini-line" />
        <span className="you-mini-line you-mini-primary" />
      </span>
    </span>
  )
}

/**
 * Light, dark or the device's own: three cards, each a miniature of the app in
 * that mode, the chosen one ringed in the accent with a check. A Radix radio
 * group, so it keys as WAI-ARIA's radio group does: one Tab stop, and the arrow
 * keys move to the next theme and choose it.
 */
export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const choice = theme === "dark" || theme === "light" ? theme : "system"
  return (
    <RadioGroupPrimitive.Root
      value={choice}
      onValueChange={setTheme}
      orientation="horizontal"
      aria-label="Theme"
      data-theme-picker=""
      className="you-themes"
    >
      {THEMES.map((t) => (
        <RadioGroupPrimitive.Item key={t.value} value={t.value} aria-label={t.label} className="you-theme group/theme">
          <span className="you-theme-card">
            <ThemeMiniature mode={t.value} />
            <span aria-hidden="true" className="you-theme-check">
              <Check className="size-3" />
            </span>
          </span>
          <span className="text-xs font-medium text-muted-foreground group-data-[state=checked]/theme:text-foreground">{t.label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  )
}

/** A readable name for an accent theme's key. */
const accentName = (key: string) => (key === "onecamp" ? "OneCamp" : key.charAt(0).toUpperCase() + key.slice(1))

/**
 * The accent: one 28px swatch per theme, each painted INSIDE its own theme
 * class with bg-brand, so it shows exactly what choosing it does. Choosing one
 * re-themes the app live, and the frame's glow crossfades to the new hue.
 */
export function AccentSwatches() {
  const { activeTheme, setActiveTheme } = useThemeConfig()
  return (
    <div role="radiogroup" aria-label="Accent colour" data-accent-swatches="" className="you-swatches">
      {VALID_COLOR_THEMES.map((color) => {
        const on = activeTheme === color
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={accentName(color)}
            title={accentName(color)}
            data-accent={color}
            onClick={() => {
              if (on) return
              crossfadeGlow(() => setActiveTheme(color))
            }}
            className={cn("you-swatch", `theme-${color} bg-brand`)}
          />
        )
      })}
    </div>
  )
}

/** How the app looks, on this device: the theme cards, then the accent. */
export function AppearanceSection() {
  return (
    <SettingsSection title="Appearance" description="Changes as you pick, on this device.">
      <SettingsList>
        <div className="set-row space-y-3">
          <p className="text-sm font-medium">Theme</p>
          <ThemePicker />
        </div>
        <div className="set-row space-y-3">
          <p className="text-sm font-medium">Accent colour</p>
          <AccentSwatches />
        </div>
      </SettingsList>
    </SettingsSection>
  )
}

type CalendarStatus = { isConnected: boolean; taskSyncEnabled: boolean }

/**
 * Google Calendar as a connection card: its glyph, whether it is connected,
 * Connect or Disconnect (asked first), and, once connected, whether task due
 * dates go onto the calendar, saved the moment it is switched.
 *
 * A status that couldn't be read is said as such, never as "Not connected"
 * with a Connect button, which started a second Google sign-in for a calendar
 * that was already linked.
 */
export function CalendarSection() {
  const confirm = useConfirm()
  // null while it loads, "failed" when it couldn't be read.
  const [status, setStatus] = useState<CalendarStatus | null | "failed">(null)
  const [problem, setProblem] = useState("")
  const sync = useSaveStatus()

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
    setProblem("")
    setStatus((prev) => (prev && prev !== "failed" ? { ...prev, taskSyncEnabled: enabled } : prev))
    const held = await sync.run(() => axiosInstance.post(PostEndpointUrl.UpdateGoogleCalendarSyncTask, { enabled }, OWN_ERRORS))
    if (!held) setStatus((prev) => (prev && prev !== "failed" ? { ...prev, taskSyncEnabled: !enabled } : prev))
  }

  const loaded = status !== null && status !== "failed" ? status : null
  const connected = !!loaded?.isConnected
  return (
    <SettingsSection title="Calendar" description="Your OneCamp tasks on your own calendar.">
      <SettingsList>
        {status === null ? (
          <div role="status" aria-label="Checking your Google Calendar connection" className="contents">
            <SettingsRowsSkeleton rows={1} control="button" />
          </div>
        ) : status === "failed" ? (
          <SettingsCardError what="your Google Calendar connection" reason="Nothing has changed. This is usually a connection problem." onRetry={load} />
        ) : (
          <div data-connection-card="" className="set-row flex items-center gap-3">
            <span aria-hidden="true" className="you-conn-tile">
              <Calendar className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Google Calendar</p>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span aria-hidden="true" className={cn("size-1.5 rounded-full", connected ? "bg-success" : "bg-ink-3")} />
                {connected ? "Connected" : "Not connected"}
              </p>
            </div>
            {/* Named for what it does, which the row's label is not. */}
            <Button
              variant="secondary"
              size="sm"
              type="button"
              aria-label={connected ? "Disconnect Google Calendar" : "Connect Google Calendar"}
              onClick={connected ? disconnect : () => void connect()}
            >
              {connected ? "Disconnect" : "Connect"}
            </Button>
          </div>
        )}
        {connected && (
          <SwitchRow
            label="Put task due dates on my calendar"
            checked={!!loaded?.taskSyncEnabled}
            status={sync.status}
            onChange={(v) => void toggleSync(v)}
          />
        )}
      </SettingsList>
      {problem && (
        <p role="alert" className="text-xs text-danger-ink text-pretty">
          {problem}
        </p>
      )}
    </SettingsSection>
  )
}

/** Password, two-step verification and passkeys: each saves when its own step is finished. */
export function SigningInSection() {
  return (
    <SettingsSection title="Sign-in and security" description="Each of these saves as soon as you finish it.">
      <SettingsList>
        <ChangePasswordSection />
        <TwoFactorSection />
        <PasskeySection />
      </SettingsList>
    </SettingsSection>
  )
}

