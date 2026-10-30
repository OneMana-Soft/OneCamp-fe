/**
 * A board's elements copied into another place: a template saved from one
 * board and laid on another, and later a .excalidraw file or a Miro board
 * (W-2). Every id is new, and every reference to one follows it (a note's
 * words, an arrow's ends, a frame's children, a group), so a copy never
 * points back into the board it came from, and two copies never collide.
 * Pure apart from the ids and nonces it draws.
 */

import { drawnBox } from "./scene"

export interface CopyableElement {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  isDeleted?: boolean
  groupIds?: readonly string[]
  frameId?: string | null
  containerId?: string | null
  boundElements?: readonly { id: string; type: string }[] | null
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
  customData?: Record<string, unknown>
  link?: string | null
  [key: string]: unknown
}

/** What a template keeps of a board: what a person sees, without pictures (their files stay with the board). Pure. */
export function templateElements<T extends CopyableElement>(elements: readonly T[]): T[] {
  const kept = elements.filter((e) => !e.isDeleted && e.type !== "image")
  const ids = new Set(kept.map((e) => e.id))
  return kept.map((e) => {
    const c: T = { ...e }
    // A note's task and any link to the work stay with the board it was made on.
    if (c.customData?.taskUuid) {
      const { taskUuid: _task, ...rest } = c.customData
      void _task
      c.customData = rest
      c.link = null
    }
    if (c.boundElements) c.boundElements = c.boundElements.filter((b) => ids.has(b.id))
    if (c.containerId && !ids.has(c.containerId)) c.containerId = null
    if (c.frameId && !ids.has(c.frameId)) c.frameId = null
    if (c.startBinding && !ids.has(c.startBinding.elementId)) c.startBinding = null
    if (c.endBinding && !ids.has(c.endBinding.elementId)) c.endBinding = null
    return c
  })
}

/**
 * Copies of elements with new ids (prefix plus a counter), every reference
 * following, versions starting again, moved so their middle is at (cx, cy).
 * Pure apart from the nonces.
 */
export function copyElements<T extends CopyableElement>(elements: readonly T[], prefix: string, cx: number, cy: number): T[] {
  const ids = new Map<string, string>()
  const groups = new Map<string, string>()
  elements.forEach((e, i) => ids.set(e.id, `${prefix}-${i}`))
  const group = (g: string) => {
    if (!groups.has(g)) groups.set(g, `${prefix}-g${groups.size}`)
    return groups.get(g)!
  }
  // Centred on (cx, cy) by the box round what's drawn (lib/board/scene's one box rule).
  const box = drawnBox(elements)
  const dx = box ? cx - (box.x + box.width / 2) : 0
  const dy = box ? cy - (box.y + box.height / 2) : 0
  const to = (id: string | null | undefined) => (id ? ids.get(id) ?? null : null)
  return elements.map((e) => {
    const c: T = {
      ...e,
      id: ids.get(e.id)!,
      x: e.x + dx,
      y: e.y + dy,
      version: 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      index: null,
      updated: Date.now(),
    }
    if (e.groupIds) c.groupIds = e.groupIds.map(group)
    if (e.frameId) c.frameId = to(e.frameId)
    if (e.containerId) c.containerId = to(e.containerId)
    if (e.boundElements) c.boundElements = e.boundElements.flatMap((b) => (ids.has(b.id) ? [{ ...b, id: ids.get(b.id)! }] : []))
    if (e.startBinding) c.startBinding = ids.has(e.startBinding.elementId) ? { ...e.startBinding, elementId: ids.get(e.startBinding.elementId)! } : null
    if (e.endBinding) c.endBinding = ids.has(e.endBinding.elementId) ? { ...e.endBinding, elementId: ids.get(e.endBinding.elementId)! } : null
    return c
  })
}
