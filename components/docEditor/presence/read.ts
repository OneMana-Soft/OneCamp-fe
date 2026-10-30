/**
 * The one reader of a collaboration's awareness into the presence store (B8):
 * at most once a frame, and published only when who is here, or how, changed.
 * Carets move on every key and a board's pointers on every mouse move; the
 * stack, the meta line and Here now render only on news. A doc's editor
 * (fromTheStart.ts) and a board's Here now (components/board/boardHereNow)
 * both read through it, under their bus key. Pure of the editor, so a board's
 * page doesn't load one.
 */

import { newSeen, presenceOf } from "./people"
import { setPresence } from "./store"
import type { AwarenessLike } from "./live"

/** How many readers a key has (a doc in split view has two): the store is cleared when the last goes. */
const readers = new Map<string, number>()

/**
 * Reads everyone's awareness into the presence store under `key`. Another
 * person's edit is news when this reader saw them before it, so it starts as
 * the view does. Returns a way to stop.
 */
export function readPresence(key: string, awareness: AwarenessLike): () => void {
  readers.set(key, (readers.get(key) ?? 0) + 1)
  const seen = newSeen()
  let edit: ReturnType<typeof presenceOf>["edit"] = null
  let said = ""
  let frame = 0
  const read = () => {
    frame = 0
    const p = presenceOf(awareness.getStates(), awareness.clientID, seen, edit, Date.now())
    edit = p.edit
    const now = JSON.stringify(p)
    if (now === said) return
    said = now
    setPresence(key, p)
  }
  const onChange = () => {
    if (!frame) frame = window.requestAnimationFrame(read)
  }
  awareness.on("change", onChange)
  read()
  return () => {
    awareness.off("change", onChange)
    window.cancelAnimationFrame(frame)
    const left = (readers.get(key) ?? 1) - 1
    if (left > 0) readers.set(key, left)
    else {
      readers.delete(key)
      setPresence(key, null)
    }
  }
}
