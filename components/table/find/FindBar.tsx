"use client"

/**
 * Find and replace over a table's view (tables G2b; gsheets-grid-01 item 3,
 * airtable-04's find). Ctrl+F (⌘F) opens this bar under the view's toolbar,
 * across the page on a phone; Ctrl+H (⌘⇧H on a Mac) opens it with Replace.
 * The server finds (lib/tables/transform): every row of the view, read here
 * or not, as the reader may see each cell, and counts the cells. ↩ and ⇧↩ go
 * through them, reading on past the first 1,000; the one it's at is brought
 * into sight with the focus left here, and Escape leaves the focus on it.
 * Replace changes that cell; Replace all every match in the view's text
 * fields, as one step that one Undo takes back; a match in any other kind of
 * field is found, never offered to a replace, and the bar says which fields
 * it changes. Someone who can only view the table finds, and is told so if
 * they replace. A chunk of its own, loaded
 * on the first Ctrl+F. It tints the cells found itself (useMarks), so the
 * grid's rows never render for a find.
 */

import * as React from "react"
import { CaseSensitive, ChevronDown, ChevronUp, Replace, Search, WholeWord, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import { isComposingKey } from "@/lib/keys/ime"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { rowsText, undoableWrite } from "@/lib/tables/ledger"
import { count, leftText, stepFields, stepKindsText, stepRefusal, transformRows, viewNamed, type TransformInput, type TransformMatch } from "@/lib/tables/transform"
import { matchesByRow, type FindMarks } from "@/lib/tables/findMarks"
import { useTableEdit } from "@/lib/tables/tableEdit"
import type { UndoOrder } from "@/lib/tables/undoOrder"
import { usePinnedPad } from "@/lib/ui/pinnedPad"
import type { ViewRows } from "@/lib/tables/viewRows"
import type { TableField } from "@/services/tableService"

export interface FindBarProps {
  /** "replace": opened with its Replace row (Ctrl+H). */
  mode: "find" | "replace"
  /** Counts each Ctrl+F or Ctrl+H: the bar takes the focus back. */
  opened: number
  tableId: string
  /** The fields the view shows, in order: those a find searches. */
  shown: TableField[]
  /** The view as it is now, its rows to be named (lib/tables/viewRows). */
  view: () => Promise<ViewRows>
  /** A match brought into sight, the focus left in the bar; with focus, the cell takes it (the bar is closing). */
  onReveal: (match: TransformMatch, focus: boolean) => void
  /** The table's undo order (useCellCommit's write): a replace is the reader's to undo. */
  write: UndoOrder["write"]
  /** The toasts' one Undo path (useCellCommit's undo): a replace's change set back, in the table's order of writes. */
  undo: (set: string) => Promise<unknown>
  /** Rows were changed: the page reads them again. */
  onChanged: () => void
  onClose: () => void
  /**
   * The matches read and the one the bar is at, as they change, and null once
   * it finds nothing or goes: for the phone's list, which draws its own rows,
   * to mark them (G2b-2). The grid's cells the bar tints itself.
   */
  onFound?: (marks: FindMarks | null) => void
}

type Named = Awaited<ReturnType<typeof viewNamed>>

/** What a find found: every cell's count, those a replace would change, the matches read so far in the view's order, and the rows it was asked over. */
interface Found {
  total: number
  replaceable: number
  matches: TransformMatch[]
  named: Named
}

const key = (m: TransformMatch) => `${m.row}:${m.field ?? ""}`

export function FindBar({ mode, opened, tableId, shown, view, write: inOrder, undo, onReveal, onChanged, onClose, onFound }: FindBarProps) {
  const [text, setText] = React.useState("")
  const [replacing, setReplacing] = React.useState(mode === "replace")
  // A reader who may only view the table (V-170) finds, and replaces nothing.
  const canEdit = useTableEdit()
  const replaceShown = replacing && canEdit
  const [replace, setReplace] = React.useState("")
  const [flags, setFlags] = React.useState({ match_case: false, whole_cell: false, regex: false })
  const [found, setFound] = React.useState<Found | null>(null)
  const [at, setAt] = React.useState(0)
  // The count in flight ("Finding…"), and a write in flight: which button's, that one busy and the other not yet.
  const [finding, setFinding] = React.useState(false)
  const [writing, setWriting] = React.useState<"one" | "all" | null>(null)
  const [note, setNote] = React.useState<string | null>(null)
  const input = React.useRef<HTMLInputElement>(null)
  const bar = React.useRef<HTMLDivElement>(null)
  const reveal = useStableCallback(onReveal)
  const viewNow = useStableCallback(view)
  const fields = JSON.stringify(shown.map((f) => f.id))
  const asked: TransformInput = { step: "find", fields: JSON.parse(fields) as string[], find: text, ...flags }
  // A replace changes the text fields alone (stepFields); a find, every field shown.
  const texts = stepFields(shown)
  const textField = (id: string | undefined) => !!id && texts.some((f) => f.id === id)
  // The find over the view as it is now: every cell's count, and the first matches in the view's order. Of those, the
  // ones a replace would change: the matches read say, when they are all of them; past the first 1,000, a find over
  // just the text fields counts them.
  const countNow = useStableCallback(async (signal?: AbortSignal): Promise<Found> => {
    const named = await viewNamed(await viewNow())
    const r = await transformRows(tableId, { ...asked, ...named }, signal)
    const others = texts.length < shown.length
    const replaceable = !texts.length
      ? 0
      : !others
        ? r.cells
        : !r.capped
          ? r.matches.filter((m) => textField(m.field)).length
          : (await transformRows(tableId, { ...asked, fields: texts.map((f) => f.id), ...named }, signal)).cells
    return { total: r.cells, replaceable, matches: r.matches, named }
  })
  const settle = (f: Found) => {
    setFound(f)
    setAt((i) => Math.min(i, Math.max(0, f.matches.length - 1)))
  }
  // After a write or its Undo: the cells change, so the matches as they were go at once (no tint on a cell that no
  // longer matches), and the count comes back over the rows as they are now. The refusal's words, if it fails.
  const recount = useStableCallback(async (): Promise<string | null> => {
    if (!bar.current) return null
    setFound(null)
    setFinding(true)
    try {
      settle(await countNow())
      return null
    } catch (e) {
      return stepRefusal(e)
    } finally {
      setFinding(false)
    }
  })
  const offerUndo = useUndoToast(() => {
    onChanged()
    void recount().then(setNote)
  })
  const current = found?.matches[at]
  // Resting on a match a replace can't change, or with none it could, the bar says which fields it changes.
  const changes = `Replace changes ${stepKindsText()} fields`
  const why = !texts.length
    ? `${changes}, and this view shows none.`
    : found?.total && !found.replaceable
      ? `None of these matches can be replaced. ${changes}.`
      : current?.field && !textField(current.field)
        ? `${shown.find((f) => f.id === current.field)?.name ?? "This field"} can't be replaced. ${changes}.`
        : null
  const whyId = React.useId()

  React.useEffect(() => {
    if (mode === "replace") setReplacing(true)
    input.current?.focus()
    input.current?.select()
  }, [opened, mode])

  React.useEffect(() => {
    if (!text) {
      setFound(null)
      setNote(null)
      return
    }
    const ask = new AbortController()
    const wait = setTimeout(async () => {
      setFinding(true)
      try {
        settle(await countNow(ask.signal))
        setNote(null)
      } catch (e) {
        if (ask.signal.aborted) return
        setFound(null)
        setNote(stepRefusal(e))
      } finally {
        if (!ask.signal.aborted) setFinding(false)
      }
    }, 250)
    return () => {
      clearTimeout(wait)
      ask.abort()
    }
  }, [text, flags, tableId, fields, countNow])

  // In the commit that shows it: the count and the cell in sight move together.
  React.useLayoutEffect(() => {
    if (current) reveal(current, false)
  }, [current, reveal])

  useMarks(bar, found?.matches, current)
  // Pinned over the page on a phone (its classes): what the page brings into sight stops under it.
  usePinnedPad(bar)
  // The phone's list marks its own rows: told in the commit that shows the count, so the two move together, and
  // again when the list takes over from the grid with the bar open; null as the bar goes.
  const tell = useStableCallback((marks: FindMarks | null) => onFound?.(marks))
  const telling = !!onFound
  React.useLayoutEffect(() => {
    if (telling) tell(found?.matches.length ? { matches: found.matches, current } : null)
  }, [telling, found?.matches, current, tell])
  React.useEffect(() => () => tell(null), [tell])

  // Past the matches read, the next ones: from the last one's row, as a row's cells may straddle a page.
  const more = async (f: Found): Promise<Found | null> => {
    try {
      const r = await transformRows(tableId, { ...asked, ...f.named, from: f.matches[f.matches.length - 1].at }, undefined)
      const seen = new Set(f.matches.map(key))
      const fresh = r.matches.filter((m) => !seen.has(key(m)))
      return fresh.length ? { ...f, matches: [...f.matches, ...fresh] } : null
    } catch (e) {
      setNote(stepRefusal(e))
      return null
    }
  }
  const step = (dir: 1 | -1) => {
    if (!found?.total) return
    const next = at + dir
    const all = found.matches.length >= found.total
    if (next < 0) return setAt(all ? found.matches.length - 1 : 0)
    if (next < found.matches.length) return setAt(next)
    if (all) return setAt(0)
    void more(found).then((f) => {
      if (!f) return
      setFound(f)
      setAt(next)
    })
  }

  // A write: the page reads the rows again while the find counts over them, and the toast lands with that count (never
  // beside the matches as they were), with the one Undo for all of it (the server reverses the step's whole operation).
  const write = async (input: TransformInput, which: "one" | "all") => {
    setWriting(which)
    try {
      // set: none when an Undo pressed on its way took it back already, so no toast offers it again (V-381).
      const { answer: r, set } = await undoableWrite(inOrder, "replace", () => transformRows(tableId, input, undefined), (t) => t.change_sets[0] ?? null)
      onChanged()
      const refused = await recount()
      setNote(refused ?? (r.cells ? null : (leftText(r) ?? "Nothing was replaced: those cells changed since.")))
      if (set) offerUndo(`Replaced ${count(r.cells)} in ${rowsText(r.rows)}`, () => undo(set), leftText(r))
    } catch (e) {
      setNote(stepRefusal(e))
    } finally {
      setWriting(null)
    }
  }
  const replaceAll = () => found?.replaceable && void write({ ...asked, step: "replace", fields: texts.map((f) => f.id), replace, ...found.named }, "all")
  const replaceOne = () => current?.field && textField(current.field) && void write({ ...asked, step: "replace", rows: [current.row], fields: [current.field], replace }, "one")
  const close = () => {
    if (current) reveal(current, true)
    onClose()
  }
  const keys = (enter: (e: React.KeyboardEvent) => void) => (e: React.KeyboardEvent) => {
    if (isComposingKey(e.nativeEvent)) return
    if (e.key === "Escape") {
      e.preventDefault()
      close()
    } else if (e.key === "Enter") {
      e.preventDefault()
      enter(e)
    }
  }
  const toggle = (flag: keyof typeof flags) => {
    setFlags((f) => ({ ...f, [flag]: !f[flag] }))
    setAt(0)
  }

  const said = !text ? "" : found ? (found.total ? `${count(at + 1)} of ${count(found.total)}` : "No matches") : finding ? "Finding…" : ""
  const box = "flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-lg bg-raised px-2 text-ui-sm shadow-e1 sm:max-w-96"
  const field = "min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3"
  // On a phone the bar is pinned under the app's bar while the page scrolls (G2b-2, DESIGN-BUILD-67 MUST 1): a
  // step that scrolls the page to bring its row in carried the bar's field and count up under the app's bar and
  // the demo's banner. Pinned, it's opaque, over the rows, with a hairline over what slides under it.
  return (
    <div ref={bar} role="search" aria-label="Find in this view" data-find-bar="" data-touch-group="" className="flex flex-wrap items-center gap-1 px-4 pb-1.5 max-sm:sticky max-sm:top-0 max-sm:z-[5] max-sm:bg-sheet max-sm:border-b max-sm:border-line max-sm:pt-1.5 sm:px-6">
      <label className={cn(box, "focus-within:focus-halo max-sm:basis-full")}>
        <Search className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
        <input
          ref={input}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setAt(0)
          }}
          onKeyDown={keys((e) => step(e.shiftKey ? -1 : 1))}
          data-escape-own=""
          aria-label="Find"
          placeholder="Find in view"
          className={field}
        />
        <span role="status" className="shrink-0 tabular-nums text-meta text-ink-3">
          {said}
        </span>
      </label>
      <Toggle label="Match case" on={flags.match_case} onToggle={() => toggle("match_case")}>
        <CaseSensitive className="size-4" />
      </Toggle>
      <Toggle label="Whole cell" on={flags.whole_cell} onToggle={() => toggle("whole_cell")}>
        <WholeWord className="size-4" />
      </Toggle>
      <Toggle label="Regular expression" on={flags.regex} onToggle={() => toggle("regex")}>
        <span aria-hidden="true" className="font-mono text-meta">
          .*
        </span>
      </Toggle>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous match" disabled={!found?.total} onClick={() => step(-1)}>
        <ChevronUp className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Next match" disabled={!found?.total} onClick={() => step(1)}>
        <ChevronDown className="size-4" />
      </Button>
      {canEdit ? (
        <Button type="button" variant="ghost" size="icon-sm" aria-label={replacing ? "Hide replace" : "Show replace"} aria-expanded={replacing} onClick={() => setReplacing(!replacing)} className={cn("text-ink-3", replacing && "text-ink")}>
          <Replace className="size-4" />
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" aria-label="Close find" onClick={close}>
        <X className="size-4" />
      </Button>
      {replaceShown ? (
        <div className="flex w-full items-center gap-1.5">
          <label className={cn(box, "focus-within:focus-halo")}>
            <input value={replace} onChange={(e) => setReplace(e.target.value)} onKeyDown={keys((e) => (e.metaKey || e.ctrlKey ? replaceAll() : replaceOne()))} data-escape-own="" aria-label="Replace with" placeholder="Replace with" className={field} />
          </label>
          <Button type="button" variant="secondary" size="sm" busy={writing === "one"} disabled={writing === "all" || finding || !textField(current?.field)} aria-describedby={why ? whyId : undefined} onClick={replaceOne}>
            Replace
          </Button>
          <Button type="button" size="sm" busy={writing === "all"} disabled={writing === "one" || finding || !found?.replaceable} aria-describedby={why ? whyId : undefined} onClick={replaceAll}>
            Replace all
          </Button>
        </div>
      ) : null}
      {replaceShown && why ? (
        <p id={whyId} className="w-full text-meta text-ink-3">
          {why}
        </p>
      ) : null}
      {note ? (
        <p role="alert" className="w-full text-meta text-danger-ink">
          {note}
        </p>
      ) : null}
    </div>
  )
}

function Toggle({ label, on, onToggle, children }: { label: string; on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={on} onClick={onToggle} className={cn("text-ink-3", on && "bg-press text-ink")}>
      {children}
    </Button>
  )
}

/**
 * Tints the cells found that are in sight in the grid (data-found), the one
 * it's at more ("at"), again as rows come into sight as it scrolls; none once
 * the bar closes. The bar marks them itself, off the grid's renders.
 */
function useMarks(bar: React.RefObject<HTMLDivElement | null>, matches: TransformMatch[] | undefined, current: TransformMatch | undefined) {
  React.useEffect(() => {
    const grid = bar.current?.closest("[data-table-page]")?.querySelector<HTMLElement>("[data-table-grid]")
    if (!grid) return
    const cells = matchesByRow(matches)
    const clear = () => grid.querySelectorAll<HTMLElement>("td[data-found]").forEach((td) => td.removeAttribute("data-found"))
    let frame = 0
    const paint = () => {
      frame = 0
      clear()
      grid.querySelectorAll<HTMLElement>("tr[data-row]").forEach((tr) => {
        const want = cells.get(tr.dataset.row ?? "")
        if (!want?.length) return
        tr.querySelectorAll<HTMLElement>(":scope > td[data-field]").forEach((td) => {
          const f = td.dataset.field ?? ""
          if (want.includes(f)) td.dataset.found = current?.row === tr.dataset.row && current?.field === f ? "at" : ""
        })
      })
    }
    paint()
    const watch = new MutationObserver(() => void (frame ||= requestAnimationFrame(paint)))
    watch.observe(grid, { childList: true, subtree: true })
    return () => {
      watch.disconnect()
      cancelAnimationFrame(frame)
      clear()
    }
  }, [bar, matches, current])
}
