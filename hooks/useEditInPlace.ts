"use client"

import { useCallback, useState } from "react"

/**
 * A message corrected in place, whose save can fail (F-06). Save closes the
 * box at once, the message showing its new words while they are saved; a
 * save that fails opens the box again holding what was typed, where it used
 * to close and put the old words back, losing what was typed.
 *
 * `save` answers whether it saved (lib/optimistic's ok); a host that answers
 * nothing is taken at its word. `draft` is what a failed save held, for the
 * box to show in place of the message's words; it goes when the box closes.
 */
export function useEditInPlace(save: (body: string) => Promise<boolean> | boolean | void) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string | undefined>()

  const open = useCallback(() => {
    setDraft(undefined)
    setEditing(true)
  }, [])

  const cancel = useCallback(() => {
    setDraft(undefined)
    setEditing(false)
  }, [])

  const finish = useCallback(
    (body: string) => {
      setDraft(undefined)
      setEditing(false)
      void Promise.resolve(save(body)).then((saved) => {
        if (saved !== false) return
        setDraft(body)
        setEditing(true)
      })
    },
    [save],
  )

  return { editing, draft, open, cancel, finish }
}
