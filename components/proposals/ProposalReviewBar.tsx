"use client"

/**
 * The review bar for a proposed change (docs programme A9): under the change,
 * in the agent tint, with Accept (⏎), Discard (Esc), Try again (⌘R) and a
 * refine field when the proposer can take one, and the changes one by one for
 * accepting some and not others. When the text under a change moved on, Accept
 * becomes Insert below.
 *
 * The same bar serves an AI rewrite (accepted in this editor, nothing on the
 * server) and a teammate's or an agent's suggestion (pass accept and decline
 * from ./persisted). The host renders it once per editor, beside the editor.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { Check, ChevronLeft, ChevronRight, CornerDownRight, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { applicable, type AcceptResult, type Tracked } from "@/lib/proposals/review"
import {
  acceptProposal,
  discardProposal,
  focusProposal,
  insertProposalBelow,
  markDecided,
  proposalsOf,
} from "@/components/minimal-tiptap/extensions/proposals"
import { ix } from "@/lib/ui/interactive"

export interface ProposalReviewBarProps {
  editor: Editor | null
  /** Who or what proposed it: "Suggested by Maya", "AI · runs on your server". */
  label?: string
  accept?: (editor: Editor, id: string, ids?: string[]) => AcceptResult | Promise<AcceptResult>
  decline?: (editor: Editor, id: string, ids?: string[]) => void | Promise<void>
  insertBelow?: (editor: Editor, id: string) => void | boolean | Promise<void>
  /** After an accept: B9 records an AI edit here. */
  onAccepted?: (id: string, result: AcceptResult, tracked: Tracked) => void
  onDiscarded?: (id: string) => void
  onRetry?: () => void
  onRefine?: (text: string) => void
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

function summary(t: Tracked): string {
  const open = t.proposal.hunks.filter((h) => !h.decision)
  return open.length === 1 ? "1 change" : `${open.length} changes`
}

export function ProposalReviewBar(props: ProposalReviewBarProps) {
  const { editor } = props
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? proposalsOf(e.state) : null),
  })
  const id = state?.focus ?? null
  const tracked = id && state ? state.active[id] : undefined
  const barRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [busy, setBusy] = useState(false)
  // A ref, not the state: a second keypress in the same tick must see the first.
  const busyRef = useRef(false)
  const [conflicts, setConflicts] = useState<string[]>([])
  const [refine, setRefine] = useState("")

  // Under the change, inside the viewport.
  const place = useCallback(() => {
    if (!editor || !tracked?.range) return setPos(null)
    try {
      const at = Math.min(tracked.range.to, editor.state.doc.content.size)
      const c = editor.view.coordsAtPos(at)
      const width = barRef.current?.offsetWidth ?? 360
      setPos({ top: c.bottom + 8, left: Math.max(16, Math.min(c.left, window.innerWidth - width - 16)) })
    } catch {
      setPos(null)
    }
  }, [editor, tracked])

  useLayoutEffect(place, [place])
  useEffect(() => {
    window.addEventListener("scroll", place, true)
    window.addEventListener("resize", place)
    return () => {
      window.removeEventListener("scroll", place, true)
      window.removeEventListener("resize", place)
    }
  }, [place])

  // A new proposal takes the keys: ⏎ accepts, Esc discards.
  useEffect(() => {
    setConflicts([])
    if (id) barRef.current?.focus({ preventScroll: true })
  }, [id])

  if (!editor || !id || !tracked) return null
  const open = tracked.proposal.hunks.filter((h) => !h.decision)
  const live = applicable(editor.state, tracked)
  const moved = new Set([...live.conflicts, ...conflicts])
  const allMoved = open.length > 0 && open.every((h) => moved.has(h.id))
  const current = state?.focusHunk ? open.find((h) => h.id === state.focusHunk) : undefined
  const index = current ? open.indexOf(current) : -1

  const run = async (fn: () => unknown) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await fn()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const accept = (ids?: string[]) =>
    run(async () => {
      const result = await (props.accept ?? acceptProposal)(editor, id, ids)
      if (result.conflicts.length) {
        setConflicts(result.conflicts)
        return
      }
      props.onAccepted?.(id, result, tracked)
      editor.commands.focus()
    })

  const decline = (ids?: string[]) =>
    run(async () => {
      if (props.decline) await props.decline(editor, id, ids)
      else if (ids) markDecided(editor, id, ids, "declined")
      else discardProposal(editor, id)
      if (!ids) props.onDiscarded?.(id)
      editor.commands.focus()
    })

  const below = () =>
    run(async () => {
      await (props.insertBelow ?? insertProposalBelow)(editor, id)
      editor.commands.focus()
    })

  const step = (by: number) => {
    if (open.length === 0) return
    const next = open[(index + by + open.length) % open.length]
    focusProposal(editor, id, next.id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return
    const mod = isMac() ? e.metaKey : e.ctrlKey
    if (e.key === "Enter" && !mod) {
      e.preventDefault()
      if (allMoved) void below()
      else void accept(current ? [current.id] : undefined)
    } else if (e.key === "Escape") {
      e.preventDefault()
      void decline(current ? [current.id] : undefined)
    } else if (mod && e.key.toLowerCase() === "r" && props.onRetry) {
      e.preventDefault()
      props.onRetry()
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault()
      step(1)
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault()
      step(-1)
    }
  }

  const mod = isMac() ? "⌘" : "Ctrl+"
  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Review the proposed change"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-proposal-review=""
      className="fixed z-40 flex max-w-[min(560px,calc(100vw-32px))] flex-wrap items-center gap-1 rounded-lg border border-[color-mix(in_oklab,var(--agent)_35%,transparent)] bg-raised p-1 shadow-e2 outline-none"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden" }}
    >
      <span className="px-2 text-xs text-agent-ink" aria-live="polite">
        {props.label ? `${props.label} · ` : ""}
        {allMoved ? "The text changed since this was proposed" : summary(tracked)}
      </span>
      {open.length > 1 && (
        <span className="flex items-center">
          <Button variant="ghost" size="icon-xs" aria-label="Previous change" onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          <span className="min-w-12 text-center text-2xs text-muted-foreground">
            {index >= 0 ? `${index + 1} of ${open.length}` : `${open.length} changes`}
          </span>
          <Button variant="ghost" size="icon-xs" aria-label="Next change" onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </span>
      )}
      {current && !moved.has(current.id) && (
        <>
          <Button variant="ghost" size="xs" onClick={() => void accept([current.id])} disabled={busy}>
            <Check /> Accept change
          </Button>
          <Button variant="ghost" size="xs" onClick={() => void decline([current.id])} disabled={busy}>
            <X /> Reject change
          </Button>
        </>
      )}
      <span className="ml-auto flex items-center gap-1">
        {allMoved ? (
          <Button size="xs" onClick={() => void below()} disabled={busy} aria-keyshortcuts="Enter">
            <CornerDownRight /> Insert below
          </Button>
        ) : (
          <Button size="xs" onClick={() => void accept()} disabled={busy || live.placed.length === 0} aria-keyshortcuts="Enter">
            <Check /> {open.length > 1 ? "Accept all" : "Accept"}
          </Button>
        )}
        <Button variant="ghost" size="xs" onClick={() => void decline()} disabled={busy} aria-keyshortcuts="Escape">
          Discard
        </Button>
        {props.onRetry && (
          <Button variant="ghost" size="xs" onClick={props.onRetry} disabled={busy} aria-keyshortcuts={isMac() ? "Meta+R" : "Control+R"} title={`Try again (${mod}R)`}>
            <RotateCcw /> Try again
          </Button>
        )}
      </span>
      {props.onRefine && (
        <form
          className="basis-full px-1 pb-0.5"
          onSubmit={(e) => {
            e.preventDefault()
            const text = refine.trim()
            if (text) {
              props.onRefine?.(text)
              setRefine("")
            }
          }}
        >
          <input
            value={refine}
            onChange={(e) => setRefine(e.target.value)}
            placeholder="Ask for a change, like “make it warmer”"
            aria-label="Refine the proposed change"
            {...ix("field")}
            className="h-7 w-full rounded-md bg-transparent px-2 text-xs placeholder:text-faint-foreground"
          />
        </form>
      )}
    </div>
  )
}
