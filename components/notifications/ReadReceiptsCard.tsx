"use client"

/**
 * A person's switch for read receipts in DMs and group chats. Off, others
 * don't see when they've read a message, and they don't see others' either.
 * Greyed out when the workspace has turned read receipts off.
 *
 * Instant, like every setting on the page (design v3, admin S2): the row's
 * saved tick says it held; a failure puts the switch back and says the
 * server's reason under the label. Never a toast for a routine save.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

type Prefs = { data?: { read_receipts?: boolean; read_receipts_allowed?: boolean } }

export function ReadReceiptsCard() {
  const prefs = useFetch<Prefs>(GetEndpointUrl.GetNotificationPreferences)
  const { status, run } = useSaveStatus()
  const data = prefs.data?.data
  // Nothing while the shared answer loads or failed: the email card above
  // reads the same request and says which.
  if (!data || data.read_receipts === undefined) return null
  const allowed = data.read_receipts_allowed !== false

  const change = async (next: boolean) => {
    const was = prefs.data
    void prefs.mutate({ ...was, data: { ...data, read_receipts: next } }, { revalidate: false })
    // The row says what went wrong, so the global toast stays quiet.
    const held = await run(() => axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, { read_receipts: next }, OWN_ERRORS))
    if (!held) void prefs.mutate(was, { revalidate: false })
  }

  return (
    <SettingsSection
      id="notifications-read-receipts"
      title="Read receipts"
      description="In DMs and group chats of up to 20 people."
    >
      <SettingsList>
        <SwitchRow
          id="read-receipts"
          label="Send and see read receipts"
          description={
            allowed
              ? "Others see “Seen” once you've read their latest message, and you see theirs. Off, neither side sees it."
              : "Your workspace has turned read receipts off."
          }
          checked={allowed && !!data.read_receipts}
          locked={allowed ? undefined : "Your workspace has turned read receipts off."}
          status={status}
          onChange={(v) => void change(v)}
        />
      </SettingsList>
    </SettingsSection>
  )
}
