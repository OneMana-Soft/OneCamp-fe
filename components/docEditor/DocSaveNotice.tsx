"use client"

import * as React from "react"

import { SAY_PROBLEM_AFTER_MS } from "@/components/docEditor/connectionTiming"
import { CHANGES_KEPT, disconnected, saveDotCopy, type SavedThing, type SaveState } from "@/components/docEditor/SaveDot"
import { useDocSaveDot, type DocSaveSource } from "@/components/docEditor/docSaveState"
import { useStandInForPill } from "@/components/error/pillPlace"
import { ToastAction } from "@/components/ui/toast"
import { toast, useToastState, type ToastTone } from "@/hooks/use-toast"
import { useDebounce } from "@/hooks/useDebounce"

/** How long "Saved" stays once the work that waited is stored. */
const SAVED_FOR_MS = 4000

export interface SaveNotice {
  words: string
  tone: ToastTone
  /** Stays until the next reading; false: it goes by itself and the notice ends. */
  stays: boolean
  /** Offers Try again (a failed save, as the dot does). */
  retry?: boolean
}

/** Whether the dot's reading puts this tab's work at risk: changes waiting while disconnected, or a failed save. Pure. */
export const saveAtRisk = (state: SaveState, waiting: number): boolean => (disconnected(state) && waiting > 0) || state === "failed"

/** Where the notice speaks: of a doc (by default) or a board, and beside the doc's connection pill or not. */
export interface NoticePlace {
  thing?: SavedThing
  /** Beside the pill, which names the connection, the notice says only what becomes of the work: CHANGES_KEPT. */
  besidePill?: boolean
}

/**
 * What the notice says for the dot's reading, once it has begun (at risk for
 * SAY_PROBLEM_AFTER_MS): the dot's own words while changes wait (beside the
 * pill, which names the connection, only what becomes of them: CHANGES_KEPT)
 * or a save failed, then that they are being saved until the database holds
 * them, then that they are saved. Null ends it: nothing waits any more. Pure.
 */
export function saveNoticeOf(state: SaveState, savedAt: Date | null, waiting: number, { thing, besidePill = false }: NoticePlace = {}): SaveNotice | null {
  if (state === "failed") return { words: saveDotCopy(state, savedAt, true, thing), tone: "error", stays: true, retry: true }
  if (saveAtRisk(state, waiting)) return { words: besidePill ? CHANGES_KEPT : saveDotCopy(state, savedAt, true, thing), tone: "warning", stays: true }
  if (state === "saving") return { words: saveDotCopy(state, savedAt, true, thing), tone: "loading", stays: true }
  if (state === "saved") return { words: saveDotCopy(state, savedAt, true, thing), tone: "success", stays: false }
  return null
}

/**
 * The save dot's words where the doc draws no dot (D05: a phone's doc has no
 * header, and focus mode hides it), only while this tab's work isn't stored
 * (V-21). It reads the dot's own state (useDocSaveDot) and says it in the
 * app's toast: a phone's sits above the tab bar, or under the top bar while
 * the keyboard is up. Try again is the session's retry. Draws nothing itself.
 * While its toast shows, "Saved" included, it says what the app's connection
 * pill would, on the pill's spot on a phone, so the pill steps aside.
 */
export function DocSaveNotice({ source, thing, onRetry, besidePill = false }: { source: DocSaveSource; onRetry?: () => void } & NoticePlace) {
  const { state, savedAt, waiting } = useDocSaveDot(source)
  const atRisk = saveAtRisk(state, waiting)
  const lasted = useDebounce(atRisk, SAY_PROBLEM_AFTER_MS) && atRisk
  // The notice: it begins once being at risk has lasted, and follows the work until it is stored.
  const open = React.useRef<ReturnType<typeof toast> | null>(null)
  // The toast the notice last opened, on screen until it closes: by itself
  // ("Saved"), dismissed, swiped away or pushed out by newer toasts.
  const [shown, setShown] = React.useState<string | null>(null)
  const { toasts } = useToastState()
  useStandInForPill(toasts.some((t) => t.id === shown && t.open !== false))
  React.useEffect(() => {
    if (!open.current && !lasted) return
    const notice = saveNoticeOf(state, savedAt, waiting, { thing, besidePill })
    if (!notice) open.current?.dismiss()
    else {
      const action =
        notice.retry && onRetry ? (
          <ToastAction altText="Try again" onClick={onRetry}>
            Try again
          </ToastAction>
        ) : undefined
      const props = { title: notice.words, tone: notice.tone, duration: notice.stays ? Infinity : SAVED_FOR_MS, action }
      if (open.current) open.current.update({ ...props, id: open.current.id })
      else {
        open.current = toast(props)
        setShown(open.current.id)
      }
    }
    if (!notice?.stays) open.current = null
  }, [lasted, state, savedAt, waiting, thing, onRetry, besidePill])

  // Leaving the doc takes its notice with it.
  React.useEffect(() => () => open.current?.dismiss(), [])
  return null
}
