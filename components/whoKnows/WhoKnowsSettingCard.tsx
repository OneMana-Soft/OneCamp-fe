"use client"

/**
 * A person's switch for Who knows (DG9): whether others may see them
 * suggested as someone who knows about something, from the work they can
 * open. On by default (O-DG3); off, they're left out of every answer,
 * wherever it's asked, and can still ask. Both editions draw it.
 *
 * Instant, like every setting on the page: the row's saved tick says it
 * held; a failure puts the switch back and says the server's reason.
 */

import * as React from "react"
import { SettingsCard, SwitchRow } from "@/components/ui/settingsSection"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { WHO_KNOWS_PATHS } from "@/lib/whoKnows/key"

type Mine = { data?: { listed?: boolean } }

export default function WhoKnowsSettingCard() {
  const mine = useFetch<Mine>(WHO_KNOWS_PATHS.me, undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const { status, run } = useSaveStatus()
  const listed = mine.data?.data?.listed
  // Nothing while it loads or if it failed: a switch that guesses would be wrong half the time.
  if (listed === undefined) return null

  // A failure puts back the other side, never a value read here: the toast's
  // Undo calls this from the render the change was made in.
  const change = async (next: boolean): Promise<boolean> => {
    void mine.mutate({ data: { listed: next } }, { revalidate: false })
    const held = await run(() => axiosInstance.put(WHO_KNOWS_PATHS.me, { listed: next }, OWN_ERRORS), switchOffer("Show me in Who knows", next, change))
    if (!held) void mine.mutate({ data: { listed: !next } }, { revalidate: false })
    return held
  }

  return (
    <SettingsCard>
      <SwitchRow
        id="who-knows-listed"
        label="Show me in Who knows"
        description={
          listed
            ? "When someone asks who knows about something, you can be suggested for work of yours they can already open: what you wrote, are assigned or commented on."
            : "You're left out of every Who knows answer, wherever it's asked. You can still ask."
        }
        checked={listed}
        status={status}
        onChange={(v) => void change(v)}
      />
    </SettingsCard>
  )
}
