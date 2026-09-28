"use client"

import { DrawerItem } from "@/components/drawers/drawerItem"
import { Bookmark, BookmarkCheck, Clock } from "@/lib/icons"
import { useLaterActions, useSavedEntry } from "@/hooks/useLater"
import { reminderChoices } from "@/lib/utils/later"
import type { LaterTarget } from "@/components/later/SaveForLater"

/**
 * Save for later on a phone's long-press menu: two rows at most. Saving, or
 * saving with tomorrow-morning's reminder, covers the common case; the Later
 * page changes a reminder afterwards.
 */
export function LaterDrawerItems({ target, onDone }: { target: LaterTarget; onDone: () => void }) {
  const saved = useSavedEntry(target.itemType, target.itemId)
  const { save, remove } = useLaterActions()

  const act = (fn: () => Promise<unknown>) => {
    onDone()
    fn().catch(() => {
      // The request layer has said what went wrong.
    })
  }

  if (saved) {
    return <DrawerItem icon={BookmarkCheck} label="Remove from Later" onClick={() => act(() => remove(saved.id))} />
  }
  const tomorrow = reminderChoices(new Date()).find((c) => c.key === "tomorrow")!
  const input = {
    item_type: target.itemType,
    item_id: target.itemId,
    link: target.link,
    title: target.title,
    context: target.context,
  }
  return (
    <>
      <DrawerItem icon={Bookmark} label="Save for later" onClick={() => act(() => save({ ...input, remind_at: null }))} />
      <DrawerItem
        icon={Clock}
        label="Remind me tomorrow morning"
        onClick={() => act(() => save({ ...input, remind_at: tomorrow.at.toISOString() }))}
      />
    </>
  )
}
