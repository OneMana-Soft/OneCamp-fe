"use client"

import { useEffect, useState } from "react"

/**
 * A task's place in the list or board it was opened from, for the panel's
 * previous and next (STEP4 #8, "2 / 86"): the data-task-id rows under a
 * data-task-sequence root, as on screen; a task in no list on screen has
 * none. J and K stay the list's (hooks/useListKeyboard).
 */
export interface TaskPlace {
  /** Its position, from 1; 0 when it's in no list on screen. */
  index: number
  total: number
  prev?: string
  next?: string
}

const NONE: TaskPlace = { index: 0, total: 0 }

/** Where taskUUID sits among the tasks of the list or board on screen that holds it. Pure over the DOM it's given. */
export function placeOf(taskUUID: string, root: ParentNode = document): TaskPlace {
  if (!taskUUID) return NONE
  const row = root.querySelector(`[data-task-sequence] [data-task-id="${CSS.escape(taskUUID)}"]`)
  const list = row?.closest("[data-task-sequence]")
  if (!list) return NONE
  const ids: string[] = []
  const seen = new Set<string>()
  for (const el of list.querySelectorAll<HTMLElement>("[data-task-id]")) {
    const id = el.dataset.taskId
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }
  const at = ids.indexOf(taskUUID)
  if (at < 0) return NONE
  return { index: at + 1, total: ids.length, prev: ids[at - 1], next: ids[at + 1] }
}

/**
 * The open task's place, kept current as the list on screen changes (a row
 * finished, a page more loaded). open(id) moves the panel to another task.
 */
export function useTaskPlace(taskUUID: string) {
  const [place, setPlace] = useState<TaskPlace>(NONE)
  useEffect(() => {
    if (typeof document === "undefined") return
    let frame = 0
    const read = () => {
      frame = 0
      setPlace((was) => {
        const now = placeOf(taskUUID)
        return was.index === now.index && was.total === now.total && was.prev === now.prev && was.next === now.next ? was : now
      })
    }
    read()
    const watch = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(read)
    })
    for (const list of document.querySelectorAll("[data-task-sequence]")) watch.observe(list, { childList: true, subtree: true })
    return () => {
      watch.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [taskUUID])
  return place
}
