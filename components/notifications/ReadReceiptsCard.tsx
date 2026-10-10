"use client"

/**
 * A person's switch for read receipts in DMs and group chats. Off, others
 * don't see when they've read a message, and they don't see others' either.
 * Greyed out when the workspace has turned read receipts off.
 */

import * as React from "react"
import { SettingsList, SettingsSection, SwitchRow } from "@/components/ui/settingsSection"
import { useToast } from "@/hooks/use-toast"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance from "@/lib/axiosInstance"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

type Prefs = { data?: { read_receipts?: boolean; read_receipts_allowed?: boolean } }

export function ReadReceiptsCard() {
  const { toast } = useToast()
  const prefs = useFetch<Prefs>(GetEndpointUrl.GetNotificationPreferences)
  const data = prefs.data?.data
  if (!data || data.read_receipts === undefined) return null
  const allowed = data.read_receipts_allowed !== false

  const change = async (next: boolean) => {
    const was = prefs.data
    void prefs.mutate({ ...was, data: { ...data, read_receipts: next } }, { revalidate: false })
    try {
      await axiosInstance.post(PostEndpointUrl.UpdateNotificationPreferences, { read_receipts: next })
      toast({ title: next ? "Read receipts on" : "Read receipts off" })
    } catch {
      void prefs.mutate(was, { revalidate: false })
      toast({ title: "Could not save that", variant: "destructive" })
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
              ? "Others see \u201cSeen\u201d under their latest message once you've read it, and you see theirs. Off, nobody sees when you've read their messages, and you don't see when they've read yours."
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
