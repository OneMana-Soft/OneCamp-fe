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
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { collaboratorHue } from "@/lib/identityHue"
import { cn } from "@/lib/utils/helpers/cn"
import { onEscape } from "@/lib/keys/onEscape"
import { setPresenceControl } from "./control"
import { followersOf, type AwarenessState } from "./people"
import { awarenessOf, flagCaret, posOf, scrollerOf, showPos, showView, viewOf, type AwarenessLike, type View } from "./live"

const IDLE_AFTER = 2 * 60_000
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
  useSayWhereIAm(editor, awareness)

  // The one followed says where they are looking while this is set.
  React.useEffect(() => {
    awareness.setLocalStateField("following", following)
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
      awareness.setLocalStateField("following", client)
      const done = () => {
        window.clearTimeout(timer)
        awareness.off("change", heard)
        if (awareness.getLocalState()?.following === client) awareness.setLocalStateField("following", followingRef.current)
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

  const user = leader?.user
  const agent = user?.kind === "agent"
  const hue = agent ? "[--hue-a1:var(--agent-a1)] [--hue-a2:var(--agent-a2)]" : user ? HUE_CLASS[collaboratorHue({ id: user.id, name: user.name, hue: user.hue })] : ""
  return (
    <>
      {following !== null && leader && (
        <div className={cn("pointer-events-none absolute inset-0 z-[15] ring-2 ring-inset ring-[var(--hue-a1)]", hue)} data-following="">
          <div className="content-float pointer-events-auto absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-lg bg-[var(--hue-a2)] py-1 pl-2.5 pr-1 text-meta font-medium text-white shadow-e3">
            <span>Following {leaderName}</span>
            <kbd className="rounded-xs bg-white/[0.18] px-1 font-sans text-micro">Esc</kbd>
            <button
              type="button"
              onClick={() => stop(`Stopped following ${leaderName}`)}
              className="rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white"
            >
              Stop
            </button>
          </div>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </>
  )
}

/** Says this tab's idle state in its awareness state. */
function usePublishIdle(awareness: AwarenessLike) {
  React.useEffect(() => {
    // Unknown until said: a tab opened out of sight says it is idle 2 minutes on.
    let idle: boolean | null = null
    let last = 0
    const set = (next: boolean) => {
      if (next === idle) return
      idle = next
      awareness.setLocalStateField("idle", next)
    }
    let timer = window.setTimeout(() => set(true), IDLE_AFTER)
    const active = () => {
      if (document.visibilityState === "hidden") return
      const now = Date.now()
      if (idle === false && now - last < 1000) return
      last = now
      set(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => set(true), IDLE_AFTER)
    }
    // A tab out of sight goes idle after the same 2 minutes, whatever moved.
    const seen = () => {
      if (document.visibilityState === "visible") active()
    }
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "focus"] as const
    for (const e of events) window.addEventListener(e, active, { capture: true, passive: true })
    document.addEventListener("visibilitychange", seen)
    active()
    return () => {
      window.clearTimeout(timer)
      for (const e of events) window.removeEventListener(e, active, { capture: true })
      document.removeEventListener("visibilitychange", seen)
    }
  }, [awareness])
}

/** While someone follows this tab, it says where it is looking (its top block), as it scrolls. */
function useSayWhereIAm(editor: Editor, awareness: AwarenessLike) {
  React.useEffect(() => {
    const scroller = scrollerOf(editor)
    if (!scroller) return
    let watched = false
    let timer = 0
    const say = () => {
      timer = 0
      if (watched) awareness.setLocalStateField("view", viewOf(editor, scroller))
    }
    const onScroll = () => {
      if (watched && !timer) timer = window.setTimeout(say, 120)
    }
    const onChange = () => {
      const now = followersOf(awareness.getStates(), awareness.clientID).length > 0
      if (now === watched) return
      watched = now
      if (now) say()
      else awareness.setLocalStateField("view", null)
    }
    awareness.on("change", onChange)
    scroller.addEventListener("scroll", onScroll, { passive: true })
    onChange()
    return () => {
      awareness.off("change", onChange)
      scroller.removeEventListener("scroll", onScroll)
      window.clearTimeout(timer)
      if (watched) awareness.setLocalStateField("view", null)
    }
  }, [editor, awareness])
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
