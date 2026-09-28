"use client"

import { useCallback } from "react"
import { useSWRConfig } from "swr"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { GetEndpointUrl } from "@/services/endPoints"
import {
  type LaterItem,
  type LaterList,
  type SaveLaterInput,
  removeLater,
  saveLater,
  setLaterDone,
  setLaterReminder,
} from "@/services/laterService"
import { reminderLabel } from "@/lib/utils/later"

const laterKey = (state: "open" | "done") => `${GetEndpointUrl.Later}?state=${state}`

/** The member's Later list: open items (due first) or finished ones. */
export function useLaterList(state: "open" | "done" = "open") {
  return useFetch<{ data: LaterList }>(laterKey(state))
}

/** The open entry for one thing, if the member saved it. */
export function useSavedEntry(itemType: string, itemId: string | undefined): LaterItem | undefined {
  const { data } = useLaterList("open")
  if (!itemId) return undefined
  return data?.data.items.find((i) => i.item_type === itemType && i.item_id === itemId)
}

/**
 * The actions on Later, each followed by a refresh of both lists (and so the
 * sidebar's count). Errors are shown by the request layer; the toasts here
 * only confirm what happened, in words the person would use.
 */
export function useLaterActions() {
  const { mutate } = useSWRConfig()
  const { toast } = useToast()
  const refresh = useCallback(
    () => mutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.Later)),
    [mutate],
  )

  const save = useCallback(
    async (input: SaveLaterInput) => {
      const item = await saveLater(input)
      await refresh()
      const when = item.remind_at ? reminderLabel(new Date(item.remind_at), new Date()).text : ""
      toast({
        title: "Saved for later",
        description: when ? `We'll remind you: ${when}.` : "Find it under Later.",
      })
      return item
    },
    [refresh, toast],
  )

  const remind = useCallback(
    async (id: string, at: Date | null) => {
      await setLaterReminder(id, at)
      await refresh()
      toast({ title: at ? `Reminder set: ${reminderLabel(at, new Date()).text}` : "Reminder removed" })
    },
    [refresh, toast],
  )

  const done = useCallback(
    async (id: string, isDone: boolean) => {
      await setLaterDone(id, isDone)
      await refresh()
    },
    [refresh],
  )

  const remove = useCallback(
    async (id: string) => {
      await removeLater(id)
      await refresh()
    },
    [refresh],
  )

  return { save, remind, done, remove, refresh }
}
