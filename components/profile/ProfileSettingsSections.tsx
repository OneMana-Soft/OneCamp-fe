"use client"

// The parts of "your profile" that save the moment they change: how the app
// looks, the Google Calendar link, and the ways you sign in. One copy, used by
// the desktop dialog and the phone's profile page, which each carried their
// own (the phone's sat inside the profile's form, so the password form was a
// form inside a form).

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { Button } from "@/components/ui/button"
import { Monitor, Moon, Sun } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import { useConfirm } from "@/hooks/useConfirm"
import { ColorThemePicker } from "@/components/activeTheme/ColorThemePicker"
import { ChangePasswordSection } from "@/components/profile/ChangePasswordSection"
import { TwoFactorSection } from "@/components/profile/TwoFactorSection"
import { PasskeySection } from "@/components/profile/PasskeySection"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"

const THEMES = [
  ["light", "Light", Sun],
  ["dark", "Dark", Moon],
  ["system", "Match system", Monitor],
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
  return (
    <SettingsSection title="Appearance" description="Changes as you pick, on this device.">
      <div className="space-y-4">
        <div className="space-y-2">
          <p id="theme-label" className="text-sm font-medium">Theme</p>
          <RadioGroupPrimitive.Root
            value={choice}
            onValueChange={setTheme}
            orientation="horizontal"
            aria-labelledby="theme-label"
            className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1"
          >
            {THEMES.map(([value, label, Icon]) => (
              <RadioGroupPrimitive.Item
                key={value}
                value={value}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
                  // The house segmented look (TabsTrigger): the raised card and
                  // a hairline, which read as chosen in both themes.
                  "data-[state=checked]:bg-card data-[state=checked]:text-foreground data-[state=checked]:ring-1 data-[state=checked]:ring-border",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
              </RadioGroupPrimitive.Item>
            ))}
          </RadioGroupPrimitive.Root>
        </div>
        <ColorThemePicker />
      </div>
    </SettingsSection>
  )
}

/** Connect, disconnect (asked first), and whether task due dates go onto the calendar. */
export function CalendarSection() {
  const confirm = useConfirm()
  const [status, setStatus] = useState<{ isConnected: boolean; taskSyncEnabled: boolean } | null>(null)
  const [updatingSync, setUpdatingSync] = useState(false)

  useEffect(() => {
    axiosInstance
      .get(GetEndpointUrl.GoogleCalendarStatus)
      .then((response) => {
        if (response.data?.data) setStatus(response.data.data)
      })
      .catch((e) => console.error("Failed to get Google Calendar status", e))
  }, [])

  const connect = async () => {
    try {
      const response = await axiosInstance.get(GetEndpointUrl.GoogleCalendarAuthUrl)
      if (response.data?.data) window.location.href = response.data.data
    } catch (e) {
      console.error("Failed to get Google Calendar Auth URL", e)
    }
  }

  const disconnect = () =>
    confirm({
      title: "Disconnect Google Calendar?",
      description: "OneCamp stops putting your task due dates on your calendar. You can connect it again any time.",
      confirmText: "Disconnect calendar",
      destructive: true,
      onConfirm: async () => {
        try {
          await axiosInstance.post(PostEndpointUrl.GoogleCalendarUnlink)
          setStatus({ isConnected: false, taskSyncEnabled: false })
        } catch (e) {
          console.error("Failed to unlink Google Calendar", e)
        }
      },
    })

  const toggleSync = async (enabled: boolean) => {
    setUpdatingSync(true)
    try {
      await axiosInstance.post(PostEndpointUrl.UpdateGoogleCalendarSyncTask, { enabled })
      setStatus((prev) => (prev ? { ...prev, taskSyncEnabled: enabled } : null))
    } catch (e) {
      console.error("Failed to update task sync preference", e)
    } finally {
      setUpdatingSync(false)
    }
  }

  const connected = !!status?.isConnected
  return (
    <SettingsSection title="Google Calendar" description="Your OneCamp tasks on your own calendar.">
      <SettingsList>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{connected ? "Connected" : "Not connected"}</p>
            <p className="text-xs text-muted-foreground text-pretty">
              {connected ? "Disconnect to stop OneCamp writing to your calendar." : "Connect to see task due dates beside your meetings."}
            </p>
          </div>
          <Button variant="outline" size="sm" type="button" className="shrink-0" onClick={connected ? disconnect : () => void connect()}>
            {connected ? "Disconnect" : "Connect"}
          </Button>
        </div>
        {connected && (
          <SwitchRow
            label="Put task due dates on my calendar"
            checked={!!status?.taskSyncEnabled}
            disabled={updatingSync}
            onChange={(v) => void toggleSync(v)}
          />
        )}
      </SettingsList>
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
