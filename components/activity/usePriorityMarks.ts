"use client"

import { useCallback, useRef, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { useUndoToast } from "@/components/ui/undoToast"
import { appMutate } from "@/lib/swrMutate"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl } from "@/services/endPoints"
import { setPriorityDismissed } from "@/services/activityService"
import type { UnifiedActivityItem } from "@/types/activity"

/**
 * PRIORITY TRIAGE YOU CAN CLEAR (A4 H5). The person takes a row out of
 * Priority, or puts it back, by the server's own key of each item
 * (UnifiedActivityItem.key: the web never builds one). The server keeps the
 * choice (POST /activity/dismiss) and from then on sends the item as
 * priority "normal" and dismissed; it also lets an ask go after 7 days, which
 * the web only reads.
 *
 * The choice shows at once, before the server answers: the Inbox keeps the
 * person's own choices this session as marks over every page it has loaded
 * (the list keeps its older pages as its own copies, so a cache patch alone
 * would leave the row on a scrolled list) and over the tabs' counts, as it
 * keeps read state. A write that fails takes its marks back off.
 *
 * Permission model: the session's own Priority only. The request names items,
 * never a person; the server takes the caller from the session.
 */

/** The person's own choices this session, by item key: true took the item out of Priority, false put it back. */
export type PriorityMarks = ReadonlyMap<string, boolean>

/** An item as the person's choices read it until the server's next answer agrees. */
export function markedItem(item: UnifiedActivityItem, marks: PriorityMarks): UnifiedActivityItem {
  const out = item.key === undefined ? undefined : marks.get(item.key)
  if (out === true && !item.dismissed) return { ...item, dismissed: true, priority: "normal" }
  // Only a row the server has as taken out goes back: one it let go of (over 7 days) stays where the server put it.
  if (out === false && item.dismissed) return { ...item, dismissed: false, priority: "high" }
  return item
}

/** Every item under the marks; the same list while there are none. */
export function withPriorityMarks(items: UnifiedActivityItem[], marks: PriorityMarks): UnifiedActivityItem[] {
  return marks.size === 0 ? items : items.map((item) => markedItem(item, marks))
}

/**
 * The Inbox's Priority choices: `marks` for its lists and counts, and
 * `choose(keys, out)`, which marks at once, writes, and once written says so
 * with an Undo (components/ui/undoToast, the app's one toast with Undo). A
 * write that fails puts the rows back and says it didn't.
 */
export function usePriorityMarks() {
  const live = useRef(new Map<string, boolean>())
  const [marks, setMarks] = useState<PriorityMarks>(() => new Map())
  const { toast } = useToast()
  const offer = useUndoToast()

  const put = useCallback((entries: [string, boolean | undefined][]) => {
    for (const [key, out] of entries) {
      if (out === undefined) live.current.delete(key)
      else live.current.set(key, out)
    }
    setMarks(new Map(live.current))
  }, [])

  // One key's writes go in order, so the server ends on the last choice; `said` is its answer per key (CR-333).
  const flight = useRef(new Map<string, Promise<void>>())
  const said = useRef(new Map<string, boolean>())
  const write = useCallback(
    async (keys: string[], out: boolean) => {
      put(keys.map((key): [string, boolean] => [key, out]))
      const ahead = keys.flatMap((key) => flight.current.get(key) ?? [])
      const sent = ahead.length ? Promise.all(ahead).then(() => setPriorityDismissed(keys, out)) : setPriorityDismissed(keys, out)
      const answered = sent.then(() => keys.forEach((key) => said.current.set(key, out)), () => {})
      for (const key of keys) flight.current.set(key, answered)
      await answered
      // A key's last write leaves the server's answer as its mark: none if no write went through.
      const last = keys.filter((key) => flight.current.get(key) === answered && flight.current.delete(key))
      put(last.map((key): [string, boolean | undefined] => [key, said.current.get(key)]))
      await sent
      // The server's answer for every page of the feed in view (the Inbox's and Home's).
      void appMutate((key) => typeof key === "string" && key.startsWith(GetEndpointUrl.GetUnifiedActivity))
    },
    [put],
  )
  const choose = useCallback(
    (keys: string[], out: boolean): Promise<void> => {
      if (keys.length === 0) return Promise.resolve()
      return write(keys, out).then(
        () => offer(out ? "Removed from Priority" : "Back in Priority", () => write(keys, !out)),
        (e: unknown) =>
          void toast({
            title: out ? "Couldn't take it out of Priority" : "Couldn't put it back in Priority",
            description: apiErrorMessage(e, "Check your connection and try again."),
            variant: "destructive",
          }),
      )
    },
    [write, offer, toast],
  )

  return { marks, choose }
}
