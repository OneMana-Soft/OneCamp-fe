"use client"

/**
 * A person's choice to be left out of docs' "Viewed by" and Insights. Off,
 * their views are recorded nowhere: not by name, not in a day's count.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { usePreferenceSwitch } from "./usePreferenceSwitch"

export function DocViewsCard() {
  const { data, value, status, change } = usePreferenceSwitch("record_views", "Record my views")
  if (!data || value === undefined) return null
  return (
    <SettingsSection
      id="notifications-doc-views"
      title="Doc views"
      description="What a doc's owner and editors see of your reading."
    >
      <SettingsList>
        <SwitchRow
          id="record-views"
          label="Record my views"
          description="Your name appears in a doc's “Viewed by”, and your visit in its daily count. Off, your views aren't recorded at all."
          checked={!!value}
          status={status}
          onChange={(v) => void change(v)}
        />
      </SettingsList>
    </SettingsSection>
  )
}
