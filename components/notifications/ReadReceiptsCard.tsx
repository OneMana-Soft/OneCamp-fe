"use client"

/**
 * A person's switch for read receipts in DMs and group chats. Off, others
 * don't see when they've read a message, and they don't see others' either.
 * Greyed out when the workspace has turned read receipts off.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { toast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

type Prefs = { data?: { read_receipts?: boolean; read_receipts_allowed?: boolean } }

export function ReadReceiptsCard() {
  const prefs = useFetch<Prefs>(GetEndpointUrl.GetNotificationPreferences)
  const data = prefs.data?.data
  // Nothing while the shared answer loads or failed: the email card above
  // reads the same request and says which.
  if (!data || data.read_receipts === undefined) return null
  const allowed = data.read_receipts_allowed !== false

  const change = async (next: boolean) => {
    const was = prefs.data
    void prefs.mutate({ ...was, data: { ...data, read_receipts: next } }, { revalidate: false })
    try {
      // The card says what went wrong, so the global toast stays quiet.
      await axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, { read_receipts: next }, OWN_ERRORS)
      toast({ title: next ? "Read receipts on" : "Read receipts off" })
    } catch (e) {
      void prefs.mutate(was, { revalidate: false })
      toast({
        title: next ? "Couldn't turn read receipts on" : "Couldn't turn read receipts off",
        description: apiErrorMessage(e, "Check your connection and try again."),
        variant: "destructive",
      })
    }
  }

  // Saves the moment it changes, and says so: the section's line names it.
  return (
    <SettingsSection
      title="Read receipts"
      description="In DMs and group chats of up to 20 people. Saved as soon as you switch it."
    >
      <SettingsList>
        <SwitchRow
          label="Send and see read receipts"
          description={
            allowed
              ? "Others see “Seen” under their latest message once you've read it, and you see theirs. Off, nobody sees when you've read their messages, and you don't see when they've read yours."
              : "Your workspace has turned read receipts off."
          }
          checked={allowed && !!data.read_receipts}
          disabled={!allowed}
          onChange={(v) => void change(v)}
        />
      </SettingsList>
    </SettingsSection>
  )
}
