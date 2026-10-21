import { parse } from "@/lib/conversation/route"

/**
 * What the right panel shows for an Inbox row (STEP4 #6, the reading pane):
 * the fields openRightPanel takes for a thread, a task or an event.
 */
export interface PanelTarget {
  channelUUID?: string
  postUUID?: string
  chatUUID?: string
  groupUUID?: string
  chatMessageUUID?: string
  taskUUID?: string
  eventUUID?: string
}

const TASK = /^\/app\/task\/([^/?#]+)\/?$/
const EVENT = /^\/app\/calendar\/event\/([^/?#]+)\/?$/

/**
 * Where a row opens beside the Inbox, from the link it opens as a page
 * (activityHref), so the panel shows exactly what the page would: a message
 * with its thread (in a channel, a DM or a group), a task, or an event. Null
 * for anything the panel doesn't hold, which opens as a page as before: a doc
 * (its comments sit beside the doc itself), a board, the calendar. Pure.
 */
export function panelTargetOf(href: string | null | undefined, viewer: string | null | undefined): PanelTarget | null {
  if (!href) return null
  const path = href.split(/[?#]/)[0]
  const task = TASK.exec(path)
  if (task) return { taskUUID: decodeURIComponent(task[1]) }
  const event = EVENT.exec(path)
  if (event) return { eventUUID: decodeURIComponent(event[1]) }
  const place = parse(path, viewer)
  if (!place?.message) return null
  const c = place.conversation
  if (c.kind === "channel") return { channelUUID: c.id, postUUID: place.message }
  if (c.kind === "group") return { groupUUID: c.id, chatMessageUUID: place.message }
  return c.other ? { chatUUID: c.other, chatMessageUUID: place.message } : null
}

/** Whether the panel shows this target now: every field the target names matches. Pure. */
export function showsTarget(panel: { isOpen: boolean; data: PanelTarget } | undefined, target: PanelTarget | null): boolean {
  if (!panel?.isOpen || !target) return false
  const keys = Object.keys(target) as (keyof PanelTarget)[]
  return keys.length > 0 && keys.every((k) => !!target[k] && panel.data[k] === target[k])
}
