"use client"

import { useCallback, useState } from "react"
import dynamic from "next/dynamic"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import type { LaterItemType } from "@/lib/utils/later"

const ReminderPicker = dynamic(() => import("@/components/later/reminderPicker"), { ssr: false })

export interface LaterTarget { itemType: LaterItemType; itemId: string; link: string; title: string; context?: string }

/** Any kind's Later entry (/later/save, /later/update): the one save, and Remind me's picker, loaded when remindMe() opens it. */
export function useRemindMe(t: LaterTarget) {
  const saved = useSavedEntry(t.itemType, t.itemId)
  const actions = useLaterActions()
  const [picking, setPicking] = useState(false)
  const remindMe = useCallback(() => setPicking(true), [])
  const saveWith = (at: Date | null) =>
    saved ? actions.remind(saved.id, at) : actions.save({ item_type: t.itemType, item_id: t.itemId, link: t.link, title: t.title, context: t.context, remind_at: at?.toISOString() ?? null })
  // The request layer says what went wrong.
  const toggle = () => (saved ? actions.remove(saved.id) : saveWith(null)).catch(() => {})
  const picker = picking && <ReminderPicker initial={saved?.remind_at ? new Date(saved.remind_at) : undefined} onClose={() => setPicking(false)} onPick={(at) => { setPicking(false); saveWith(at).catch(() => {}) }} />
  return { ...actions, saved, saveWith, toggle, picking, remindMe, picker }
}
