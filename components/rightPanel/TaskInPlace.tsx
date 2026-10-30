"use client"

import { useEffect, useLayoutEffect, type ReactNode } from "react"
import { useDispatch, useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import { inPlace } from "@/lib/navigation/appRouter"
import { taskInPlace } from "@/lib/navigation/inPlace"
import { keptTaskOf } from "@/lib/offline/keptTask"
import { isTaskKey } from "@/lib/work/keysApi"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { RightPanelSheet } from "@/components/rightPanel/RightPanelSheet"
import { panelLoaders } from "@/components/rightPanel/rightPanel"
import { warmAhead } from "@/lib/offline/warmAhead"

// What the sheet needs with no network, on the device ahead through the offline layer's ONE warm list (V-100): the
// task's panel with every part it draws (warmTaskParts), and the toasts' foot slot, which the sheet's comment box
// asks for the first time it is used. The panel comes through the right panel's own loader for it (panelLoaders), the
// one every place that fetches a panel ahead uses, never a second import of its module.
const warmSheet = () => Promise.all([panelLoaders.task().then((m) => m.warmTaskParts()), import("@/components/ui/toastFootSlot")])

/**
 * Where the one rule acts (lib/navigation/inPlace, asana-12 (a)): while the
 * browser is offline, a link to a task's page, or a move in code to one,
 * opens the task in the right panel (a sheet on a phone), and nothing moves.
 *
 * A chunk of its own (LayoutContent): only a device that loses the network
 * uses it, so no route's first load carries it (V-49). The task's panel, with
 * its parts, comes to the device ahead (lib/offline/warmAhead), so it opens with no network. On a
 * phone, `body` is the right panel's: the task opens in a sheet over the page.
 */
export function TaskInPlace({ body }: { body?: ReactNode }) {
  const dispatch = useDispatch()
  const open = useSelector((state: RootState) => !!(state.rightPanel.rightPanelState.isOpen && state.rightPanel.rightPanelState.data?.taskUUID))
  // While online, at the page's first idle moment, with no press first: a phone that loses the network on the way
  // still opens its tasks.
  useEffect(() => warmAhead(warmSheet), [])
  useEffect(() => {
    const take = (href: string) => {
      const task = taskInPlace(href, navigator.onLine, location.href)
      if (task === null) return false
      // A task's page reads by its key too (/app/task/Q4-12: the panel's own Open the full page and Copy link give
      // it). The device keeps tasks by id, so a key opens the task kept under it; one it keeps none under is asked
      // for by its key, as its page would be.
      if (isTaskKey(task)) void keptTaskOf(task).then((id) => dispatch(openRightPanel({ taskUUID: id ?? task })))
      else dispatch(openRightPanel({ taskUUID: task }))
      return true
    }
    // A link's own press, taken before Next's Link moves (it leaves a press
    // already handled alone). One for another tab, or a download, is the
    // browser's.
    const press = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return
      if (take(link.href)) e.preventDefault()
    }
    inPlace.add(take)
    document.addEventListener("click", press, true)
    return () => {
      inPlace.delete(take)
      document.removeEventListener("click", press, true)
    }
  }, [dispatch])
  // While the sheet is over the page, its comment box owns the screen's foot:
  // the page says so (html[data-task-sheet], app/phone.css), before it paints.
  const sheet = open && !!body
  useLayoutEffect(() => {
    if (!sheet) return
    const root = document.documentElement
    root.dataset.taskSheet = ""
    return () => {
      delete root.dataset.taskSheet
    }
  }, [sheet])
  if (!sheet) return null
  return (
    <RightPanelSheet key="open" label="Task" shape="shell-panel-phone">
      {body}
    </RightPanelSheet>
  )
}
