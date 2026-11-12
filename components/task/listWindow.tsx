"use client"

import * as React from "react"

import { useStableCallback } from "@/hooks/useStableCallback"
import type { TaskGroup } from "@/lib/tasks/grouping"
import { lendListNav } from "@/lib/ui/listNav"
import { useWindowedRows } from "@/lib/ui/useWindowedRows"
import { drawnIndexes, firstScreen, layFlow, planGroups, type Flow, type FlowItem, type GroupPlan } from "@/lib/ui/windowedRows"
import type { TaskInfoInterface } from "@/types/task"

/** Drawn before the window is known (its first frame, or jsdom): a tall screen's worth. */
const FIRST_SCREEN_PX = 1200
/** Each item's height on a computer: GroupedTaskList's GROUP_H and ROW_H, the "+" field, the empty line's h-12. */
const PX = { header: 36, row: 40, add: 40, empty: 48, more: 36 }

const rowOf = (el: Element | null) => el?.closest("[data-task-id]")?.getAttribute("data-task-id") ?? null

/**
 * What a window keeps drawn, read from the page: the focused row, a row whose menu is open, the rows a drag holds,
 * and the header of a section a drag holds (B-2: data-reorder-held on [data-group-header], as on a held row).
 */
export function keptKeys(list: Element): string[] {
  const head = (el: Element) => {
    const group = el.closest("[data-group]")?.getAttribute("data-group")
    return group ? `${group}#head` : null
  }
  return [
    list.contains(document.activeElement) ? rowOf(document.activeElement) : null,
    ...Array.from(list.querySelectorAll('[data-task-id] [aria-expanded="true"], [data-task-id][data-reorder-held]'), rowOf),
    ...Array.from(list.querySelectorAll("[data-group-header][data-reorder-held]"), head),
  ].filter((k): k is string => !!k)
}

/**
 * The element a list scrolls in: the page's declared scroller ([data-list-scroller]: the project's, My Tasks', a split
 * pane's), else the nearest ancestor whose overflow scrolls.
 */
export function scrollerOf(el: Element | null): HTMLElement | null {
  const declared = el?.closest<HTMLElement>("[data-list-scroller]")
  if (declared) return declared
  for (let a = el?.parentElement ?? null; a; a = a.parentElement) {
    const y = getComputedStyle(a).overflowY
    if (y === "auto" || y === "scroll") return a
  }
  return null
}

/**
 * A long grouped list's window (the windowing scope, 21 Oct 2026), watched
 * beside the list (GroupedTaskList, which fetches this chunk once it holds
 * more than `above` tasks). It lays the list's flow out (lib/ui/windowedRows),
 * and, while more than `above` rows are shown (fewer, and find-in-page finds them all),
 * finds the window (lib/ui/useWindowedRows) and hands the list each group's
 * plan: what to draw and the space around it. A first screen is planned until
 * the window is known. As it lands, the list only stops drawing the rows far
 * from the screen; the ones near it and any the person is on stay the same
 * nodes.
 *
 * Kept drawn wherever the window is: the opened task's row, the "+" field,
 * and, read from the page as the window moves, the focused row, a row whose
 * menu is open (aria-expanded) and the rows a drag holds
 * (data-reorder-held). The list lends the keys its order (lib/ui/listNav).
 */
export const ListWindow = React.memo(function ListWindow({
  above,
  groups,
  collapsed,
  more,
  adding,
  box,
  shownOf,
  opened,
  onPlans,
}: {
  above: number
  groups: TaskGroup[]
  collapsed: Set<string>
  more: Set<string>
  /** The group whose "+" field is open, if any. */
  adding: string | null
  box: React.RefObject<HTMLDivElement | null>
  /** A group's rows shown: its first ones, or all once "Show N more" is pressed. */
  shownOf: (group: TaskGroup, more: Set<string>) => TaskInfoInterface[]
  /** The opened task's id, if any, from the list (this part reads no store). */
  opened: string | null
  onPlans: (plans: Map<string, GroupPlan> | null) => void
}) {
  const { flow, rows } = React.useMemo(() => {
    const items: FlowItem[] = []
    let rows = 0
    for (const g of groups) {
      items.push({ key: `${g.key}#head`, group: g.key, header: true, size: PX.header })
      if (collapsed.has(g.key)) continue
      if (adding === g.key) items.push({ key: `${g.key}#add`, group: g.key, size: PX.add })
      if (g.when === "today" && g.tasks.length === 0) items.push({ key: `${g.key}#empty`, group: g.key, size: PX.empty })
      const shown = shownOf(g, more)
      for (const t of shown) items.push({ key: t.task_uuid, group: g.key, row: true, size: PX.row })
      rows += shown.length
      if (g.tasks.length > shown.length) items.push({ key: `${g.key}#more`, group: g.key, size: PX.more })
    }
    return { flow: layFlow(items), rows }
  }, [groups, collapsed, adding, more, shownOf])
  const on = rows > above

  const [scroller, setScroller] = React.useState<HTMLElement | null>(null)
  React.useLayoutEffect(() => {
    if (on) setScroller(scrollerOf(box.current))
  }, [on, box])

  const { window, scrollTo } = useWindowedRows({ flow, list: box, scroller })
  const first = window?.first ?? -1
  const last = window?.last ?? -1
  // What the window keeps, read from the page as it moves.
  const kept = React.useMemo(
    () => (box.current ? keptKeys(box.current) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read again each time the window moves
    [first, last, box],
  )
  const plans = React.useMemo(() => {
    if (!on) return null
    const keep = [...kept, opened, adding && `${adding}#add`].flatMap((k) => {
      const i = k ? flow.index.get(k) : undefined
      return i === undefined ? [] : [i]
    })
    return planGroups(flow, drawnIndexes(flow.items.length, first < 0 ? firstScreen(flow, FIRST_SCREEN_PX) : { first, last }, keep))
  }, [on, flow, first, last, kept, opened, adding])
  React.useLayoutEffect(() => onPlans(plans), [plans, onPlans])
  React.useLayoutEffect(() => () => onPlans(null), [onPlans])

  // The keys: the list's order, and a reveal that scrolls the window to a row and focuses it once drawn.
  const now = React.useRef<Flow>(flow)
  const pending = React.useRef<string | null>(null)
  const scrollToNow = useStableCallback(scrollTo)
  React.useLayoutEffect(() => {
    now.current = flow
  })
  React.useEffect(() => {
    const list = box.current
    if (!on || !list) return
    // The key's row takes the focus as it lands (the list draws it after this window's move, and the window draws no more).
    const landed = new MutationObserver(() => {
      const id = pending.current
      const row = id ? list.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`) : null
      if (row) {
        pending.current = null
        row.focus({ preventScroll: true })
      }
    })
    landed.observe(list, { childList: true, subtree: true })
    const lent = lendListNav(list, {
      order: () => now.current.items.flatMap((it) => (it.row ? [it.key] : [])),
      has: (id) => !!now.current.items[now.current.index.get(id) ?? -1]?.row,
      reveal: (id, focus = true) => {
        const row = list.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
        if (row) {
          row.scrollIntoView({ block: "nearest", inline: "nearest" })
          // A key's row focused now: an earlier key's, still to be drawn, no longer takes the focus once it is.
          if (focus) {
            pending.current = null
            row.focus({ preventScroll: true })
          }
          return
        }
        const i = now.current.index.get(id)
        if (i === undefined) return
        if (focus) pending.current = id
        scrollToNow(i)
      },
    })
    return () => {
      landed.disconnect()
      lent()
    }
  }, [on, box, scrollToNow])
  return null
})
