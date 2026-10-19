"use client"

/**
 * An agent's edits, marked in a doc's margin (docs programme B9, editor.md
 * P2-2; the shell's 'gutter' slot, AI edition only): "Release Captain · 2m ·
 * Revert" beside what the agent wrote, with a thin rule in the agent tint down
 * the blocks it wrote. Revert puts back exactly what was there before the
 * agent wrote (the API's version, business/AI docEdit.go); when someone has
 * edited the agent's text since, it asks first.
 *
 * Where an agent wrote is kept beside the doc's body, not in it: the doc's
 * `agentEdits` map in its live copy (the collaboration service's live/ops
 * write.js), edit id → {agent, asker, run, at, from, to}, from and to being
 * Yjs positions of the blocks written, so every open tab sees the same marks.
 * Who the agent and the asker are, and whether this reader may revert, is the
 * API's (GET /doc/ai/agent-edits).
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import type * as Y from "yjs"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { resolveRelative } from "@/lib/proposals/core"
import { yBindingOf } from "@/lib/proposals/review"
import { Spark } from "@/components/ui/graphics/motifs"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils/helpers/cn"
import { agoOrDate, fullDateTime } from "@/lib/utils/date/shortDate"
import { getAgentEdits, revertAgentEdit, type AgentEdit } from "@/lib/ai/docAIApi"

const AGENT_EDITS = "agentEdits"
/** The newest edits marked at once; the record has the rest. */
const MAX_MARKS = 30

interface Mark {
  id: string
  from: number
  to: number
  at: number
  edit?: AgentEdit
}

interface Placed extends Mark {
  top: number
  height: number
}

/**
 * Where the marks go across, in the box's px: the rule just left of the text,
 * and the chip just right of it when the margin has room for it ("full"),
 * else a small mark there that opens the chip ("compact").
 */
export interface Across {
  rule: number
  chip: number
  mode: "full" | "compact"
}

/** Room a full chip needs beside the text: "Release Captain · 2m · Revert" whole, and a gap. */
const CHIP_ROOM = 244

/**
 * Where the marks go across, in the box's px, from the text column, the box
 * and the right edge the page can draw to (its scroller's). Pure.
 */
export function acrossOf(text: { left: number; right: number }, box: { left: number }, edge: number): Across {
  const rule = text.left - box.left - 12
  if (edge - text.right >= CHIP_ROOM) return { rule, chip: text.right - box.left + 12, mode: "full" }
  // A narrow page: the small mark in what margin there is, never past the edge.
  return { rule, chip: Math.min(text.right - box.left + 4, edge - box.left - 24), mode: "compact" }
}

/** The right edge the page can draw to: the doc's scroller's, or the window's. */
function edgeOf(from: HTMLElement): number {
  for (let el = from.parentElement; el; el = el.parentElement) {
    const o = getComputedStyle(el).overflowY
    if (o === "auto" || o === "scroll") return Math.min(el.getBoundingClientRect().right, window.innerWidth) - 8
  }
  return window.innerWidth - 8
}

/** "2m", "3h", "yesterday", "9 Oct": the chip's age. Pure. */
export function age(at: Date, now = new Date()): string {
  const s = agoOrDate(at, now)
  return s === "just now" ? "now" : s.replace(/ ago$/, "")
}

/** The agent edits in a doc's live copy, newest first, where their blocks are now. */
function marksIn(editor: Editor, map: Y.Map<unknown>, edits: Map<string, AgentEdit>): Mark[] {
  const b = yBindingOf(editor.state)
  if (!b) return []
  const out: Mark[] = []
  const entries = [...map.entries()] as Array<[string, { at?: number; from?: string; to?: string }]>
  entries.sort((x, y) => (y[1]?.at ?? 0) - (x[1]?.at ?? 0))
  for (const [id, e] of entries.slice(0, MAX_MARKS)) {
    const edit = edits.get(id)
    if (edit?.reverted) continue
    const from = resolveRelative(b.ydoc, b.fragment, b.mapping, e?.from)
    const to = resolveRelative(b.ydoc, b.fragment, b.mapping, e?.to)
    if (from === null || to === null || to <= from) continue
    out.push({ id, from, to, at: e?.at ?? 0, edit })
  }
  return out
}

export default function DocAiAgentEdits({ editor, docId }: SlotProps) {
  const box = React.useRef<HTMLDivElement>(null)
  const [edits, setEdits] = React.useState<Map<string, AgentEdit>>(new Map())
  const [placed, setPlaced] = React.useState<Placed[]>([])
  const [across, setAcross] = React.useState<Across>({ rule: -12, chip: 0, mode: "compact" })
  const [version, setVersion] = React.useState(0)
  const ymap = useEditorState({
    editor: editor ?? null,
    selector: ({ editor: e }) => (e ? (yBindingOf(e.state)?.ydoc.getMap(AGENT_EDITS) ?? null) : null),
    // The map itself, by identity: a deep comparison would walk Yjs's own graph.
    equalityFn: (a, b) => a === b,
  })

  // The doc's agent edits change: the marks, and who wrote them, again.
  React.useEffect(() => {
    if (!ymap) return
    const bump = () => setVersion((v) => v + 1)
    ymap.observe(bump)
    return () => ymap.unobserve(bump)
  }, [ymap])

  React.useEffect(() => {
    if (!ymap || ymap.size === 0 || !docId) return
    let current = true
    getAgentEdits(docId).then(
      (list) => current && setEdits(new Map(list.map((e) => [e.edit_id, e]))),
      () => undefined,
    )
    return () => {
      current = false
    }
  }, [ymap, docId, version])

  // Where each mark sits, once a frame at most, as the text moves; nothing is
  // read, and nothing listens, in a doc no agent wrote in.
  const marked = !!editor && !!ymap && ymap.size > 0
  React.useEffect(() => {
    if (!editor || !ymap || !marked) {
      setPlaced((p) => (p.length ? [] : p))
      return
    }
    let frame = 0
    const measure = () => {
      frame = 0
      if (editor.isDestroyed || !box.current) return
      const frameBox = box.current.getBoundingClientRect()
      const origin = frameBox.top
      // The text column: the editor's box less its padding.
      const dom = editor.view.dom as HTMLElement
      const r = dom.getBoundingClientRect()
      const cs = getComputedStyle(dom)
      const text = { left: r.left + (parseFloat(cs.paddingLeft) || 0), right: r.right - (parseFloat(cs.paddingRight) || 0) }
      setAcross((a) => {
        const next = acrossOf(text, frameBox, edgeOf(box.current!))
        return a.rule === next.rule && a.chip === next.chip && a.mode === next.mode ? a : next
      })
      const next: Placed[] = []
      for (const m of marksIn(editor, ymap, edits)) {
        try {
          const top = editor.view.coordsAtPos(Math.min(m.from + 1, editor.state.doc.content.size)).top - origin
          const bottom = editor.view.coordsAtPos(Math.max(m.from + 1, m.to - 1)).bottom - origin
          next.push({ ...m, top, height: Math.max(20, bottom - top) })
        } catch {
          // Not drawn yet: placed on the next change.
        }
      }
      setPlaced(next)
    }
    const later = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) later()
    }
    later()
    editor.on("transaction", onTransaction)
    window.addEventListener("resize", later)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      editor.off("transaction", onTransaction)
      window.removeEventListener("resize", later)
    }
  }, [editor, ymap, marked, edits, version])

  if (!editor || placed.length === 0) return <div ref={box} aria-hidden="true" />
  return (
    <div ref={box} className="relative" data-doc-agent-edits="">
      {placed.map((m) => (
        <AgentMark key={m.id} mark={m} across={across} docId={docId} onReverted={() => setVersion((v) => v + 1)} />
      ))}
    </div>
  )
}

function AgentMark({ mark, across, docId, onReverted }: { mark: Placed; across: Across; docId: string; onReverted(): void }) {
  const [asking, setAsking] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  // A compact mark's chip, opened from it.
  const [open, setOpen] = React.useState(false)
  const edit = mark.edit
  const name = edit?.agent_name || "An agent"
  const when = new Date(mark.at || Date.parse(edit?.at ?? "") || Date.now())
  const title = `${name} wrote this${edit?.asker_name ? ` for ${edit.asker_name}` : ""}, ${fullDateTime(when)}. Revert puts back what was there before.`
  const compact = across.mode === "compact"

  const revert = async (force = false) => {
    setBusy(true)
    const answer = await revertAgentEdit(docId, { edit_id: mark.id }, force)
    setBusy(false)
    if (answer.ok) {
      setAsking(null)
      setOpen(false)
      toast({ title: `Reverted ${name}'s edit` })
      onReverted()
      return
    }
    if (answer.editedSince && !force) return setAsking(answer.message)
    toast({ title: answer.message, variant: "destructive" })
  }

  const chip = (
    <div
      className={cn(
        "flex max-w-[min(236px,calc(100vw-24px))] items-center gap-1.5 rounded-sm bg-raised py-0.5 pl-1.5 pr-1 text-meta text-ink-2 shadow-e1",
        // Opened from the small mark: as wide as its words, so the name is whole.
        compact ? "absolute right-0 top-6 z-10 w-max shadow-e2" : "absolute",
      )}
      style={compact ? undefined : { left: across.chip, top: mark.top - 2 }}
      title={title}
      data-agent-edit={mark.id}
      data-escape-own={compact ? "" : undefined}
      onKeyDown={(e) => {
        if (compact && e.key === "Escape") {
          e.preventDefault()
          setOpen(false)
        }
      }}
    >
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-agent-muted text-agent">
        <Spark size={10} />
      </span>
      <span className="min-w-0 truncate font-[510] text-ink">{name}</span>
      <span className="shrink-0 text-ink-3">· {age(when)}</span>
      {edit?.can_revert && !asking && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void revert()}
          className="shrink-0 rounded-sm px-1.5 text-agent-ink outline-none hover:bg-agent-muted focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
        >
          · Revert
        </button>
      )}
    </div>
  )

  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute w-[2px] rounded-[1px] bg-[color-mix(in_oklab,var(--agent)_45%,transparent)]"
        style={{ left: across.rule, top: mark.top, height: mark.height }}
      />
      {compact ? (
        <div className="absolute" style={{ left: across.chip, top: mark.top - 2 }}>
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${name}'s edit, ${agoOrDate(when)}`}
            title={title}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex size-5 items-center justify-center rounded-[6px] bg-agent-muted text-agent shadow-e1 outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand max-sm:size-6"
          >
            <Spark size={11} />
          </button>
          {open && chip}
        </div>
      ) : (
        chip
      )}
      {asking && (
        <div
          role="alertdialog"
          aria-label="Revert anyway?"
          className="absolute z-10 flex w-[280px] max-w-[calc(100vw-32px)] flex-col gap-2 rounded-[12px] bg-raised p-3 text-ui-sm text-ink shadow-e3"
          style={{ left: Math.max(0, across.chip + (compact ? 24 : 0) - 280), top: mark.top + 24 }}
        >
          <p>{asking}</p>
          <div className="flex justify-end gap-1">
            <button
              type="button"
              onClick={() => setAsking(null)}
              className="h-7 rounded-md px-2 text-ink-2 outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand"
            >
              Keep it
            </button>
            <button
              type="button"
              autoFocus
              disabled={busy}
              onClick={() => void revert(true)}
              className="h-7 rounded-md bg-agent px-2 font-[510] text-agent-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              Revert anyway
            </button>
          </div>
        </div>
      )}
    </>
  )
}
