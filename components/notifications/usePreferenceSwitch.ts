"use client"

/**
 * One of a person's own preference switches, saved the moment it is
 * switched (design v3, admin S2): the row's saved tick says it held and the
 * toast offers it back under its label; a failure puts the switch back and
 * says the server's reason on the row. Every card on the notifications page
 * reads the same request.
 */

import { useRef } from "react"
import { switchOffer, useSaveStatus } from "@/components/ui/saveStatus"
import { useFetch } from "@/hooks/useFetch"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { GetEndpointUrl } from "@/services/endPoints"
import { InboxPost } from "@/services/endpoints/inbox"

type PreferenceAnswer = { data?: Record<string, unknown> }

export function usePreferenceSwitch(key: string, label: string) {
  const prefs = useFetch<PreferenceAnswer>(GetEndpointUrl.GetNotificationPreferences)
  const { status, run } = useSaveStatus()
  // The other cards change the same answer, and a toast's Undo or a late
  // failure comes after they may have: this switch is set on the answer as it
  // is then, never on the copy its change was made with.
  const latest = useRef(prefs.data)
  latest.current = prefs.data
  const put = (on: boolean) => void prefs.mutate({ ...latest.current, data: { ...latest.current?.data, [key]: on } }, { revalidate: false })
  const change = async (next: boolean): Promise<boolean> => {
    put(next)
    // The row says what went wrong, so the global toast stays quiet.
    const held = await run(
      () => axiosInstance.post(InboxPost.UpdateNotificationPreferences, { [key]: next }, OWN_ERRORS),
      switchOffer(label, next, change),
    )
    if (!held) put(!next)
    return held
  }
  const data = prefs.data?.data
  return { data, value: data?.[key] as boolean | undefined, status, change }
}
