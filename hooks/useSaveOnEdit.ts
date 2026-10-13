"use client"

import { useCallback, useEffect, useRef } from "react"

/**
 * Saves what the person changed, once they pause: call the returned edit(value)
 * from the field's own change handler (a keystroke, a tag picked), and
 * save(value) runs `delay` ms after the last one. A value the component sets
 * itself (its first state, the server's answer copied in) never goes through
 * edit, so it is never sent back.
 *
 * The task panel kept its tags in state and saved the state's debounced copy
 * from an effect. That effect also ran on mount, with the state's empty first
 * value: on a task whose details were already cached (opened before, or
 * prefetched for J then Enter, or the full task page), it saved the task's
 * tags as empty, and GitHub sync stripped the linked issue's labels
 * (PROJ-BUG-1). Here a save can only come from an edit.
 *
 * An edit still waiting when the component goes (the panel closed) or moves
 * to another `key` (the next task) is saved then, with the save it was made
 * with, so it lands on the task it was made for.
 */
export function useSaveOnEdit<T>(save: (value: T) => void, { delay = 500, key }: { delay?: number; key?: string } = {}): (value: T) => void {
  const latest = useRef(save)
  useEffect(() => {
    latest.current = save
  })
  const pending = useRef<{ value: T; save: (value: T) => void } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const edit = pending.current
    pending.current = null
    if (edit) edit.save(edit.value)
  }, [])

  useEffect(() => () => flush(), [key, flush])

  return useCallback(
    (value: T) => {
      pending.current = { value, save: latest.current }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )
}
