"use client"

/**
 * Live presence over a doc's editor (B8; the 'editorOverlay' slot, loaded a
 * moment after the doc opens). It
 *   - says this tab's idle state in its awareness: idle after 2 minutes with
 *     no input;
 *   - says where this tab is looking only while someone follows it, so a
 *     reader's tab, or a doc nobody follows, sends nothing more;
 *   - follows someone: their screen, or their caret as it moves, until Esc,
 *     until the reader moves the page themselves, or until they leave; and
 *     jumps to someone once.
 * Someone is always found by their awareness client, never by name: two
 * people called Sam are two people (N50). This tab's edits, and everyone's
 * state read into the presence store (the stack, "Edited just now by Maya"),
 * start with the editor instead: presence/fromTheStart.ts.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useDocBus } from "@/components/docEditor/registry/commandBus"
import { onEscape } from "@/lib/keys/onEscape"
import { setPresenceControl } from "./control"
import { FollowFrame } from "./FollowFrame"
import { usePublishIdle } from "./idle"
import { FOLLOWING_FIELD } from "./fields"
import type { AwarenessState } from "./people"
import { useSayWhereIAm, type LookSource } from "./sayWhereIAm"
import { awarenessOf, flagCaret, posOf, scrollerOf, showPos, showView, viewOf, type AwarenessLike, type View } from "./live"

const PAGE_KEYS = new Set(["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "])

export default function PresenceOverlay({ editor }: SlotProps) {
  const awareness = editor && !editor.isDestroyed ? awarenessOf(editor) : null
  if (!editor || !awareness) return null
  return <Presence key={awareness.clientID} editor={editor} awareness={awareness} />
}

const caretOf = (s: AwarenessState | undefined) => (s?.cursor as { head?: unknown } | null | undefined)?.head ?? null
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

function Presence({ editor, awareness }: { editor: Editor; awareness: AwarenessLike }) {
  const bus = useDocBus()
  const [following, setFollowing] = React.useState<number | null>(null)
  const [said, setSaid] = React.useState("")
  const followingRef = React.useRef(following)
  followingRef.current = following

  usePublishIdle(awareness)
  // Its top block, said while someone follows this tab (presence/sayWhereIAm).
  const look = React.useCallback((): LookSource | null => {
    const scroller = scrollerOf(editor)
    if (!scroller) return null
    return {
      read: () => viewOf(editor, scroller),
      listen: (onMove) => {
        scroller.addEventListener("scroll", onMove, { passive: true })
        return () => scroller.removeEventListener("scroll", onMove)
      },
    }
  }, [editor])
  useSayWhereIAm(awareness, look)

  // The one followed says where they are looking while this is set.
  React.useEffect(() => {
    awareness.setLocalStateField(FOLLOWING_FIELD, following)
  }, [awareness, following])

  const leader = following !== null ? awareness.getStates().get(following) : undefined
  const leaderName = leader?.user?.name || "them"
  const stop = React.useCallback((why: string) => {
    setFollowing(null)
    setSaid(why)
  }, [])
  useFollow(editor, awareness, following, leaderName, stop)

  const jump = React.useCallback(
    (client: number) => {
      const scroller = scrollerOf(editor)
      const s = awareness.getStates().get(client)
      if (!scroller || !s) return false
      const pos = posOf(editor, caretOf(s))
      if (pos !== null) {
        showPos(editor, scroller, pos, true)
        flagCaret(editor, s.user?.id, pos)
        return true
      }
      if (s.view && showView(editor, scroller, s.view as View)) return true
      // No caret (a reader, or a tab not in the text) and no view: ask where
      // they are looking (they say it while someone follows), once.
      awareness.setLocalStateField(FOLLOWING_FIELD, client)
      const done = () => {
        window.clearTimeout(timer)
        awareness.off("change", heard)
        if (awareness.getLocalState()?.[FOLLOWING_FIELD] === client) awareness.setLocalStateField(FOLLOWING_FIELD, followingRef.current)
      }
      const heard = () => {
        const view = awareness.getStates().get(client)?.view
        if (!view) return
        showView(editor, scroller, view as View)
        done()
      }
      const timer = window.setTimeout(done, 2500)
      awareness.on("change", heard)
      return true
    },
    [editor, awareness],
  )

  const follow = React.useCallback(
    (client: number | null) => {
      setFollowing(client)
      const name = client === null ? "" : awareness.getStates().get(client)?.user?.name
      setSaid(client === null ? "Stopped following" : `Following ${name || "them"}. Press Esc to stop.`)
    },
    [awareness],
  )

  React.useEffect(() => {
    if (!bus.key) return
    setPresenceControl(bus.key, { jump, follow, following })
  }, [bus.key, jump, follow, following])
  React.useEffect(() => () => setPresenceControl(bus.key, null), [bus.key])

  return <FollowFrame leader={following !== null && leader ? { ...leader.user, name: leaderName } : null} said={said} onStop={() => stop(`Stopped following ${leaderName}`)} />
}

/** Keeps the followed person's screen, or their caret, in view until Esc, the reader's own scroll, or their leaving. */
function useFollow(editor: Editor, awareness: AwarenessLike, following: number | null, name: string, stop: (said: string) => void) {
  const stopRef = React.useRef(stop)
  stopRef.current = stop
  const nameRef = React.useRef(name)
  if (name !== "them") nameRef.current = name

  React.useEffect(() => {
    if (following === null) return
    const scroller = scrollerOf(editor)
    if (!scroller) return
    let timer = 0
    let lastView = ""
    let lastCaret = ""
    const end = (why: string) => stopRef.current(why)
    const tick = () => {
      timer = 0
      const s = awareness.getStates().get(following)
      if (!s) {
        end(`${nameRef.current} left the doc, so you're no longer following them`)
        return
      }
      const view = JSON.stringify(s.view ?? null)
      const caret = JSON.stringify(caretOf(s))
      // Their screen when they say it; else their caret as it moves.
      if (view !== lastView && s.view) showView(editor, scroller, s.view as View)
      else if (caret !== lastCaret) {
        const pos = posOf(editor, caretOf(s))
        if (pos !== null) showPos(editor, scroller, pos, false)
      }
      lastView = view
      lastCaret = caret
    }
    const onChange = () => {
      if (!timer) timer = window.setTimeout(tick, 100)
    }
    const stopped = () => end(`Stopped following ${nameRef.current}`)
    const onKey = (e: KeyboardEvent) => {
      if (PAGE_KEYS.has(e.key) && !typing(e.target)) stopped()
    }
    // Esc stops following: the page layer of the one Escape (lib/keys/escape),
    // after a menu or a dialog open over the doc.
    const stopEscape = onEscape("page", () => stopped())
    const onDown = (e: Event) => {
      if (scroller.contains(e.target as Node)) stopped()
    }
    awareness.on("change", onChange)
    window.addEventListener("keydown", onKey)
    scroller.addEventListener("wheel", stopped, { passive: true })
    scroller.addEventListener("touchmove", stopped, { passive: true })
    scroller.addEventListener("pointerdown", onDown)
    tick()
    return () => {
      window.clearTimeout(timer)
      awareness.off("change", onChange)
      stopEscape()
      window.removeEventListener("keydown", onKey)
      scroller.removeEventListener("wheel", stopped)
      scroller.removeEventListener("touchmove", stopped)
      scroller.removeEventListener("pointerdown", onDown)
    }
  }, [editor, awareness, following])
}
