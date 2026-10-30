"use client"

// Tables B1's cells (D-TB-3, STEP5 spec E) that aren't text or a select's
// chips: people's faces, a long text's first lines, a rating's stars, and what
// a row says of itself (its id, when it was made or last changed, and by
// whom), which nobody writes. Their pickers and a computer's long-text box
// are cellPickers' (a chunk of its own, behind the table's first screen); a
// phone's long-text sheet is here, so a tap is answered at once.

import * as React from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { Face, PeopleFaces, RatingStar } from "./kindViews"
import { LazyPopover } from "./LazyPopover"
import { cellPickers, ComboboxCell, PickerLoading } from "./cellPickerPart"
import { PopoverContent } from "@/components/ui/popover"
import { idText, momentText, momentTitle, ratingMax, takesOnePerson } from "@/lib/fieldTypes/kindsMore"
import { hiddenText, leadLine } from "@/lib/tables/cellFormat"
import { linesFace } from "@/components/table/cellFaces"
import { useSheetMode } from "@/components/ui/overlayMode"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { LONG_TEXT_BOX, caretAtEnd, useLongTextDraft } from "@/components/table/longTextBox"
import { isHiddenRef, relationWrite, type RelationRef, type TableField } from "@/services/tableService"

/** A grid cell's own outline goes: the cell rings itself while it holds focus (table.css .v3-grid td:focus-within). */
const FOCUS = "outline-none"

/** The picker's place while its chunk loads: a popover with a moment in it. */
function PickerWait() {
  return (
    <PopoverContent align="start" sideOffset={2} className="w-auto bg-transparent p-0 shadow-none">
      <PickerLoading />
    </PopoverContent>
  )
}

/** A people field's cell: the faces, and a click (or Enter) opens the members to pick from. */
export function PeopleCell({
  field,
  value,
  cellId,
  readOnly,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  readOnly?: boolean
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const saved = React.useMemo<RelationRef[]>(() => (Array.isArray(value) ? (value as RelationRef[]) : []), [value])
  const [refs, setRefs] = React.useState(saved)
  React.useEffect(() => setRefs(saved), [saved])
  const names = refs.filter((r) => r.label).map((r) => r.label).join(", ")
  const change = (next: RelationRef[]) => {
    setRefs(next)
    void onCommit(relationWrite(next)).then((ok) => {
      if (!ok) setRefs(saved)
    })
  }
  const body = <PeopleFaces refs={refs} readOnly={readOnly} />
  if (readOnly) {
    return (
      <div data-cell={cellId} tabIndex={-1} className="flex h-full items-center px-3 outline-none" aria-label={`${field.name}: ${names || "no one"}`}>
        {body}
      </div>
    )
  }
  const button = (
    <button type="button" data-cell={cellId} aria-label={`${field.name}: ${names || "no one"}`} className={cn("flex h-full w-full items-center px-3 text-left", FOCUS)}>
      {body}
      {refs.length === 0 ? (
        <span className="text-ui text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto">
          Add someone
        </span>
      ) : null}
    </button>
  )
  // The combobox (SA-3), its rows the members, with the cell as its trigger.
  return (
    <ComboboxCell
      trigger={button}
      picker={(m, open, setOpen) => (
        <m.PeopleCombobox trigger={button} open={open} onOpenChange={setOpen} name={field.name} refs={refs} one={takesOnePerson(field)} onChange={change} />
      )}
    />
  )
}

/**
 * A long text (STEP5 spec E): its first line, with an ellipsis, in a 32px row;
 * two or four lines in tall rows, every line in the record. A click (or
 * Enter) opens its editor under the cell, a box that grows to eight lines;
 * on a phone, a sheet with Cancel and Save under it.
 */
export function LongTextCell({
  field,
  value,
  cellId,
  readOnly,
  lines,
  panel,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  readOnly?: boolean
  /** How many lines a row shows: 1, 2 or 4. */
  lines: 1 | 2 | 4
  /** In the record panel: every line. */
  panel?: boolean
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const saved = typeof value === "string" ? value : value == null ? "" : String(value)
  const [text, setText] = React.useState(saved)
  React.useEffect(() => setText(saved), [saved])
  const [open, setOpen] = React.useState(false)
  const sheet = useSheetMode()
  const many = panel || lines > 1
  const shown = linesFace(text, panel ? "all" : lines, "flex-1 text-left text-ui text-ink")
  const align = many ? "items-start py-2" : "items-center"
  if (readOnly) {
    return (
      <div data-cell={cellId} tabIndex={-1} className={cn("flex h-full px-3 outline-none", align)} title={text || undefined}>
        {shown}
      </div>
    )
  }
  const save = (next: string) => {
    setText(next)
    void onCommit(next).then((ok) => {
      if (!ok) setText(saved)
    })
  }
  const trigger = (
    <button type="button" data-cell={cellId} aria-label={`${field.name}: ${leadLine(text).line || "empty"}`} className={cn("flex h-full w-full px-3", FOCUS, align)}>
      {shown}
    </button>
  )
  if (sheet) {
    return (
      <>
        {React.cloneElement(trigger, { onClick: () => setOpen(true) })}
        {open ? <LongTextSheet name={field.name} value={text} onSave={save} onClose={() => setOpen(false)} /> : null}
      </>
    )
  }
  return (
    <LazyPopover open={open} onOpenChange={setOpen} trigger={trigger}>
      <cellPickers.View fallback={<PickerWait />} render={(m) => <m.LongTextEditor name={field.name} value={text} onSave={save} onClose={() => setOpen(false)} />} />
    </LazyPopover>
  )
}

/**
 * A long text's editor on a phone (DESIGN-BUILD-11's S4), where there's no Esc
 * and a tap away can't be told from a slip: the shared sheet, titled with the
 * field's name, its box taking the sheet's width, and Cancel and Save pinned
 * under it. Closing the sheet another way, a swipe or the scrim, is Cancel.
 * The cell's own, not the pickers' chunk's: on a slow line a tap showed
 * nothing until that chunk landed. The sheet's own frame (ResponsiveDialog)
 * stands in while the sheet loads.
 */
function LongTextSheet({ name, value, onSave, onClose }: { name: string; value: string; onSave: (text: string) => void; onClose: () => void }) {
  const { text, setText, edited } = useLongTextDraft(value)
  return (
    <ResponsiveDialog
      title={name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (edited) onSave(text)
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <textarea autoFocus rows={8} value={text} aria-label={name} onChange={(e) => setText(e.target.value)} onFocus={caretAtEnd} className={cn(LONG_TEXT_BOX, "min-h-40")} />
    </ResponsiveDialog>
  )
}

/**
 * A rating (STEP5 spec E): its stars, 14px, filled in the sun hue up to the
 * cell's value and line-2 past it; ink-3 where it can't be changed. A click on
 * a star rates that many, and on the star already rated clears it; the
 * pointer over a star previews it. From the keyboard, 1 to 9 rate that many
 * (up to the field's most) and 0, Backspace or Delete clears it; the arrows
 * still move between cells.
 */
export function RatingCell({
  field,
  value,
  cellId,
  readOnly,
  onCommit,
}: {
  field: TableField
  value: unknown
  cellId: string
  readOnly?: boolean
  onCommit: (v: unknown) => Promise<boolean>
}) {
  const max = ratingMax(field)
  const saved = typeof value === "number" && value >= 1 ? Math.min(Math.round(value), max) : 0
  const [shown, setShown] = React.useState(saved)
  React.useEffect(() => setShown(saved), [saved])
  const [preview, setPreview] = React.useState(0)
  const rate = (n: number) => {
    const next = n === shown ? 0 : n
    setShown(next)
    void onCommit(next || null).then((ok) => {
      if (!ok) setShown(saved)
    })
  }
  const lit = preview || shown
  return (
    <div
      data-cell={cellId}
      tabIndex={-1}
      role={readOnly ? "img" : "group"}
      aria-label={`${field.name}: ${shown ? `${shown} of ${max}` : "not rated"}`}
      onKeyDown={(e) => {
        if (readOnly || e.altKey || e.metaKey || e.ctrlKey) return
        if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
          e.preventDefault()
          if (shown) rate(shown)
          return
        }
        if (/^[1-9]$/.test(e.key) && Number(e.key) <= max) {
          e.preventDefault()
          if (Number(e.key) !== shown) rate(Number(e.key))
        }
      }}
      onPointerLeave={() => setPreview(0)}
      className="group/rating flex h-full items-center gap-0.5 px-3 outline-none"
      data-rating={shown || undefined}
    >
      {/* Unrated: nothing at rest, the stars on hover or focus (always on touch). */}
      {readOnly && !shown ? null : Array.from({ length: max }, (_, i) => {
        const n = i + 1
        const on = n <= lit
        const star = <RatingStar on={on} locked={readOnly} />
        if (readOnly) return <React.Fragment key={n}>{star}</React.Fragment>
        return (
          <button
            key={n}
            type="button"
            tabIndex={-1}
            aria-label={n === shown ? `Clear the rating of ${n}` : `Rate ${n} of ${max}`}
            aria-pressed={n === shown}
            onPointerEnter={() => setPreview(n)}
            onClick={() => rate(n)}
            className={cn(
              "-m-0.5 inline-flex size-[18px] items-center justify-center rounded-sm hover:bg-hover",
              !lit && "[@media(hover:hover)]:opacity-0 group-hover/rating:opacity-100 group-focus/rating:opacity-100 group-focus-within/rating:opacity-100",
            )}
          >
            {star}
          </button>
        )
      })}
    </div>
  )
}

/**
 * What a row says of itself, never typed in (STEP5 spec E): its id as a
 * task's key reads (DEAL-12: meta, 510, tabular, ink-3); when it was made or
 * last changed, in meta ink-3 ("2 days ago" within a week, then "12 Oct"),
 * the full date in its tooltip; and who, as a 20px face and their name.
 */
export function RowStampCell({ field, value, cellId }: { field: TableField; value: unknown; cellId: string }) {
  if (field.type === "created_by" || field.type === "modified_by") {
    const refs = Array.isArray(value) ? (value as RelationRef[]) : []
    const person = refs.find((r) => r.label && !isHiddenRef(r))
    return (
      <div data-cell={cellId} tabIndex={-1} className="flex h-full min-w-0 items-center gap-1.5 px-3 outline-none" aria-label={`${field.name}: ${person?.label ?? "no one"}`}>
        {person ? (
          <>
            <Face name={person.label as string} className="ring-0" />
            <span className="truncate text-ui text-ink-2">{person.label}</span>
          </>
        ) : refs.length ? (
          <span className="truncate text-meta text-ink-3">{hiddenText(refs.length)}</span>
        ) : null}
      </div>
    )
  }
  if (field.type === "autonumber") {
    const key = idText(field, value)
    return (
      <div data-cell={cellId} tabIndex={-1} className="flex h-full items-center px-3 outline-none" aria-label={`${field.name}: ${key || "none yet"}`}>
        <span className="truncate text-meta font-[510] tabular-nums text-ink-3" data-row-key="">
          {key}
        </span>
      </div>
    )
  }
  const title = momentTitle(value)
  return (
    <div data-cell={cellId} tabIndex={-1} className="flex h-full items-center px-3 outline-none" title={title || undefined} aria-label={`${field.name}: ${title || "never"}`}>
      <span className="truncate text-meta tabular-nums text-ink-3">{momentText(value)}</span>
    </div>
  )
}
