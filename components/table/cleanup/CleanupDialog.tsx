"use client"

/**
 * A table's clean-ups (tables G2b; gsheets-grid-01 item 5): remove duplicate
 * rows, trim spaces, split a text column, each over every row of the view,
 * read here or not, as the server runs it (lib/tables/transform). The dialog
 * counts first, with a dry run that writes nothing, so Apply says what it
 * will do; Apply is then one step that one Undo takes back, deleted rows
 * included. Opened from the More menu (over the view's shown fields) or from
 * a column's menu (that column alone). A drawer on a phone, its footer pinned
 * (ResponsiveDialog). A chunk of its own, loaded on the first clean-up.
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useUndoToast } from "@/components/table/ledger/useUndoToast"
import { undoChange } from "@/lib/tables/ledger"
import { cellsText, count, leftText, stepFields, stepRefusal, transformRows, viewNamed, type CleanStep, type TransformInput, type TransformResult } from "@/lib/tables/transform"
import type { ViewRows } from "@/lib/tables/viewRows"
import type { TableField } from "@/services/tableService"

export interface CleanupDialogProps {
  step: CleanStep
  /** The column it was opened from: the step covers it alone. None: the view's shown fields. */
  field?: string
  tableId: string
  /** The fields the view shows, in order. */
  shown: TableField[]
  /** The view as it is now, its rows to be named (lib/tables/viewRows). */
  view: () => Promise<ViewRows>
  /** Rows were changed: the page reads them again. */
  onChanged: () => void
  onClose: () => void
}

const TITLES: Record<CleanStep, string> = { dedupe: "Remove duplicate rows", trim: "Trim spaces", split: "Split text column" }

const rowWord = (n: number) => (n === 1 ? "row" : "rows")
const cellWord = (n: number) => (n === 1 ? "cell" : "cells")

/** What a dry run found, in words, and the Apply button's. */
function said(step: CleanStep, r: TransformResult): { count: string; more?: string; apply: string } {
  if (step === "dedupe") return r.rows ? { count: `${count(r.rows)} duplicate ${rowWord(r.rows)} of ${count(r.walked)}`, apply: `Remove ${count(r.rows)} ${rowWord(r.rows)}` } : { count: `No duplicate rows in ${count(r.walked)} ${rowWord(r.walked)}`, apply: "Remove rows" }
  if (step === "trim") return r.cells ? { count: `${cellsText(r.cells)} with spaces to trim, in ${count(r.walked)} ${rowWord(r.walked)}`, apply: `Trim ${cellsText(r.cells)}` } : { count: `No spaces to trim in ${count(r.walked)} ${rowWord(r.walked)}`, apply: "Trim spaces" }
  const over = r.overwrites ? `${count(r.overwrites)} filled ${cellWord(r.overwrites)} will be written over` : undefined
  if (!r.rows) return { count: `Nothing to split in ${count(r.walked)} ${rowWord(r.walked)}`, apply: "Split" }
  const parts = r.max_parts ?? 1
  return { count: parts > 1 ? `Splits ${cellsText(r.rows)} into up to ${count(parts)} parts` : `Copies ${cellsText(r.rows)} whole: none has the separator`, more: over, apply: `Split ${cellsText(r.rows)}` }
}

/** What a step did, for its toast. */
function done(step: CleanStep, r: TransformResult): string {
  if (step === "dedupe") return `Removed ${count(r.deleted)} duplicate ${rowWord(r.deleted)}`
  return step === "trim" ? `Trimmed spaces in ${cellsText(r.cells)}` : `Split ${cellsText(r.rows)}`
}

type Named = Awaited<ReturnType<typeof viewNamed>>

export function CleanupDialog({ step, field, tableId, shown, view, onChanged, onClose }: CleanupDialogProps) {
  const texts = stepFields(shown)
  const [source, setSource] = React.useState(() => field ?? texts[0]?.id ?? "")
  const [separator, setSeparator] = React.useState(",")
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => new Set())
  const [found, setFound] = React.useState<{ r: TransformResult; named: Named } | null>(null)
  // The dry run's count in flight (the step waits for it), and the step's own write (its button busy).
  const [counting, setCounting] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  // Bumped when a write changed nothing: the dry run counts again.
  const [round, setRound] = React.useState(0)
  const offerUndo = useUndoToast(onChanged)
  const viewNow = useStableCallback(view)

  // The fields it covers: a column alone when opened from one; else a dedupe compares every shown field, a trim tidies the text ones.
  const fields = step === "split" ? [source].filter(Boolean) : field ? [field] : (step === "dedupe" ? shown : texts).map((f) => f.id)
  // A split's parts go to the text fields picked, the first part to the first, in the table's order.
  const targets = texts.filter((f) => f.id !== source)
  const into = targets.filter((f) => picked.has(f.id)).map((f) => f.id)
  const asked: TransformInput = { step, fields, ...(step === "split" ? { separator, into } : {}) }
  const key = JSON.stringify(asked)
  const ready = fields.length > 0 && (step !== "split" || (into.length > 0 && separator !== ""))
  const hint = step === "split" && targets.length ? (!into.length ? "Pick the fields its parts go to." : separator ? "" : "Type what separates the parts.") : ""

  React.useEffect(() => {
    setFound(null)
    if (!ready) return
    const ask = new AbortController()
    const wait = setTimeout(async () => {
      setCounting(true)
      try {
        const named = await viewNamed(await viewNow())
        const r = await transformRows(tableId, { ...(JSON.parse(key) as TransformInput), dry_run: true, ...named }, ask.signal)
        setFound({ r, named })
        setNote(null)
      } catch (e) {
        if (ask.signal.aborted) return
        setNote(stepRefusal(e))
      } finally {
        if (!ask.signal.aborted) setCounting(false)
      }
    }, 250)
    return () => {
      clearTimeout(wait)
      ask.abort()
    }
  }, [key, ready, round, tableId, viewNow])

  const words = found ? said(step, found.r) : null
  const some = !!found && (step === "dedupe" ? found.r.rows : step === "trim" ? found.r.cells : found.r.rows) > 0

  // The step itself, over the rows the dry run counted: one Undo takes all of it back.
  const apply = async () => {
    if (!found) return
    setBusy(true)
    try {
      const r = await transformRows(tableId, { ...asked, ...found.named }, undefined)
      onChanged()
      if (!r.change_sets.length) {
        setNote(leftText(r) ?? "Nothing was changed: those rows changed since.")
        setRound((n) => n + 1)
        return
      }
      offerUndo(done(step, r), () => undoChange(tableId, r.change_sets[0]), leftText(r))
      onClose()
    } catch (e) {
      setNote(stepRefusal(e))
    } finally {
      setBusy(false)
    }
  }

  const from = field ? shown.find((f) => f.id === field)?.name : undefined
  const description =
    step === "dedupe"
      ? `A row whose ${from ? `${from} matches` : "shown fields all match"} an earlier row's is removed; the first of each stays.`
      : step === "trim"
        ? `Spaces at either end of ${from ? `each ${from} cell` : "each text cell"} go, and a run of them inside becomes one.`
        : "Each cell is cut at the separator, its parts going to the fields picked, the first part to the first. The column itself stays as it is."
  const footer = (
    <>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="button" busy={busy} disabled={counting || !some} onClick={() => void apply()}>
        {words?.apply ?? (step === "dedupe" ? "Remove rows" : step === "trim" ? "Trim spaces" : "Split")}
      </Button>
    </>
  )
  return (
    <ResponsiveDialog title={TITLES[step]} description={description} footer={footer} onClose={onClose}>
      <div className="flex min-w-0 flex-col gap-4 text-ui-sm" data-cleanup={step}>
        {step === "split" ? (
          <>
            {field ? null : texts.length ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-meta font-medium text-ink-2">Column to split</span>
                <Select
                  value={source}
                  onValueChange={(id) => {
                    setSource(id)
                    setPicked((p) => new Set([...p].filter((x) => x !== id)))
                  }}
                >
                  <SelectTrigger aria-label="Column to split" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {texts.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : (
              <p className="text-ink-2">This view shows no text column to split.</p>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-meta font-medium text-ink-2">Separator</span>
              <Input value={separator} onChange={(e) => setSeparator(e.target.value)} aria-label="Separator" maxLength={20} className="h-9 w-24 font-mono" />
            </label>
            <fieldset className="flex min-w-0 flex-col gap-1">
              <legend className="mb-1.5 text-meta font-medium text-ink-2">Into</legend>
              {targets.length ? (
                targets.map((f) => (
                  <label key={f.id} className="flex min-h-8 items-center gap-2 text-ink">
                    <Checkbox
                      checked={picked.has(f.id)}
                      onCheckedChange={(v) => setPicked((p) => (v === true ? new Set([...p, f.id]) : new Set([...p].filter((x) => x !== f.id))))}
                      aria-label={f.name}
                    />
                    <span className="min-w-0 truncate">{f.name}</span>
                  </label>
                ))
              ) : (
                <p className="text-ink-2">Add a text column for the parts to go to first.</p>
              )}
            </fieldset>
          </>
        ) : null}
        <div className="flex min-h-10 flex-col justify-center gap-0.5">
          <p role="status" className="font-medium text-ink">
            {words?.count ?? (ready ? (note ? "" : "Counting…") : hint)}
          </p>
          {words?.more ? <p className="text-meta text-warning-ink">{words.more}</p> : null}
        </div>
        {note ? (
          <p role="alert" className="text-meta text-danger-ink">
            {note}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
