"use client"

/**
 * A person's switch for read receipts in DMs and group chats. Off, others
 * don't see when they've read a message, and they don't see others' either.
 * Greyed out when the workspace has turned read receipts off.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { usePreferenceSwitch } from "./usePreferenceSwitch"

export function ReadReceiptsCard() {
  const { data, value, status, change } = usePreferenceSwitch("read_receipts", "Read receipts")
  // Nothing while the shared answer loads or failed: the email card above
  // reads the same request and says which.
  if (!data || value === undefined) return null
  const allowed = data.read_receipts_allowed !== false

  return (
    <SettingsSection
      id="notifications-read-receipts"
      title="Read receipts"
      description="In DMs and group chats of up to 20 people. Off, neither side sees it."
    >
      <SettingsList>
        <SwitchRow
          id="read-receipts"
          label="Send and see read receipts"
          description={allowed ? "Others see “Seen” once you've read their latest message, and you see theirs." : "Your workspace has turned read receipts off."}
          checked={allowed && !!value}
          locked={allowed ? undefined : "Your workspace has turned read receipts off."}
          status={status}
          onChange={(v) => void change(v)}
        />
      </SettingsList>
    </SettingsSection>
  )
}
