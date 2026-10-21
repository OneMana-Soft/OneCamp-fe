"use client"

import * as React from "react"
import { NodeSelection } from "@tiptap/pm/state"
import { useSheetMode } from "@/components/ui/overlayMode"
import { anchorTo } from "@/components/ui/anchor"
import { heldBeside } from "@/components/ui/heldAnchor"
import { Drawer, DrawerContent, DrawerTitle, SheetCancel, SheetGroup } from "@/components/ui/drawer"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils/helpers/cn"
import { COLOUR_LABEL, DOC_COLOURS, colourName, inkOf, tintOf, type DocColour } from "@/lib/docColours"
import { clearColourAsk, colourAsk, onColourAsk, type ColourAsk } from "@/components/minimal-tiptap/extensions/block-color/colourUi"
import { blockPickOf, colourTargets, recentColours, rememberColour, type ColourPick } from "@/components/minimal-tiptap/extensions/block-color/colourPicks"

/**
 * THE COLOUR GRID (B2; editor.md P1-2, perf 4.5): seven doc colours for text
 * and seven for a background, each row led by Default, which takes that row's
 * colour off, and the colours used last above them. It opens from Colour on
 * the selection bar, the block menu and the phone's bar (colour.open), over
 * the text on a wider screen and as a sheet on a phone.
 *
 * With text selected it colours the text (or highlights it); from the block
 * menu, the blocks; with nothing selected, the caret's block. Keyboard: the
 * arrows move in and between the rows, Enter picks, Escape goes back to the
 * text, and Tab goes from row to row.
 */

export interface ColourRow {
  id: "recent" | "text" | "background"
  label: string
  picks: ColourPick[]
}

/** The grid's rows: Last used (when there is one), then Text colour and Background, each led by Default. Pure. */
export function colourRows(recent: ColourPick[]): ColourRow[] {
  const row = (background: boolean) => [null, ...DOC_COLOURS].map((colour): ColourPick => ({ colour, background }))
  return [
    ...(recent.length ? [{ id: "recent" as const, label: "Last used", picks: recent }] : []),
    { id: "text", label: "Text colour", picks: row(false) },
    { id: "background", label: "Background", picks: row(true) },
  ]
}

/** A swatch's name, in its row ("Blue"), or out of it ("Blue background", in Last used). Pure. */
export function pickLabel(p: ColourPick, standalone = false): string {
  const name = p.colour ? COLOUR_LABEL[p.colour] : "Default"
  if (!standalone) return name
  return p.background ? (p.colour ? `${name} background` : "No background") : p.colour ? `${name} text` : "Default text"
}

type Now = { text: DocColour | null; background: DocColour | null }

/** What is chosen now: the selected text's colour and highlight, or the block's own colour. */
export function chosenNow({ editor, range, blocks }: Pick<ColourAsk, "editor" | "range" | "blocks">): Now {
  const { selection } = editor.state
  if (!range && !blocks?.length && !selection.empty && !(selection instanceof NodeSelection)) {
    const highlight = editor.isActive("highlight") ? (editor.getAttributes("highlight").color as DocColour | undefined) ?? "sun" : null
    return { text: colourName(editor.getAttributes("textStyle").color), background: highlight }
  }
  const pick = blockPickOf(colourTargets(editor.state, range, blocks)[0]?.node)
  return { text: pick && !pick.background ? pick.colour : null, background: pick?.background ? pick.colour : null }
}

const isChosen = (p: ColourPick, now: Now) => (p.background ? now.background : now.text) === p.colour

/** The diagonal of "no background". */
const NONE = "linear-gradient(to top right, transparent calc(50% - 0.75px), var(--ink-3) calc(50% - 0.75px), var(--ink-3) calc(50% + 0.75px), transparent calc(50% + 0.75px))"

/** A swatch: an A in the ink for text, the tint (with the text's own A) for a background. */
function Swatch({ pick, size }: { pick: ColourPick; size: string }) {
  const { colour, background } = pick
  const style: React.CSSProperties = background
    ? { background: colour ? tintOf(colour) : NONE, color: "var(--ink)" }
    : { color: colour ? inkOf(colour) : "var(--ink)" }
  return (
    <span aria-hidden="true" className={cn("grid place-items-center rounded-md font-[590] ring-1 ring-inset ring-line", size)} style={style}>
      {background && !colour ? null : "A"}
    </span>
  )
}

/** Applies a pick where the grid was opened, and remembers it. */
function apply(ask: ColourAsk, pick: ColourPick, focus: boolean) {
  const { editor, range, blocks } = ask
  if (editor.isDestroyed || !editor.isEditable) return
  const chain = editor.chain()
  if (focus) chain.focus()
  if (chain.applyColour(pick, range, blocks).run()) rememberColour(pick)
}

export default function ColourMenu({ onClose }: { docId: string; onClose(): void }) {
  const [ask, setAsk] = React.useState<ColourAsk | null>(colourAsk)
  // Asked again while open (another block, another selection): opened afresh there.
  const [opened, reopen] = React.useReducer((n: number) => n + 1, 0)
  React.useEffect(
    () =>
      onColourAsk(() => {
        setAsk(colourAsk())
        reopen()
      }),
    [],
  )
  // A sheet by the one phone rule (components/ui/overlayMode): a phone in landscape too.
  const sheet = useSheetMode()
  // The ask holds an editor: let it go with the grid, so a closed doc's editor isn't kept.
  const done = React.useCallback(() => {
    clearColourAsk()
    onClose()
  }, [onClose])
  if (!ask || ask.editor.isDestroyed) return null
  return sheet ? <ColourSheet key={opened} ask={ask} onClose={done} /> : <ColourPopover key={opened} ask={ask} onClose={done} />
}

/**
 * Where the popover stands (components/ui/anchor): the block menu's place,
 * kept beside its first block as the doc reflows, else under the selection,
 * measured on each ask. Never (0, 0): a block or an editor that left the page
 * leaves the last place it was seen.
 */
export function colourAnchorOf({ editor, anchor, range }: Pick<ColourAsk, "editor" | "anchor" | "range">) {
  if (anchor) {
    const block = range && !editor.isDestroyed ? editor.view.nodeDOM(range.from) : null
    return heldBeside(new DOMRect(anchor.left, anchor.top, 0, anchor.bottom - anchor.top), block instanceof Element ? block : null)
  }
  return anchorTo(
    () => {
      const { from, to } = editor.state.selection
      try {
        const a = editor.view.coordsAtPos(from)
        const b = editor.view.coordsAtPos(to)
        const top = Math.min(a.top, b.top)
        return new DOMRect(Math.min(a.left, b.left), top, 0, Math.max(a.bottom, b.bottom) - top)
      } catch {
        // No place for the selection: the editor's own corner.
        const r = editor.view.dom.getBoundingClientRect()
        return new DOMRect(r.left, r.top, 0, 0)
      }
    },
    () => editor.view.dom,
  )
}

function ColourPopover({ ask, onClose }: { ask: ColourAsk; onClose(): void }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const rows = React.useMemo(() => colourRows(recentColours()), [])
  const now = React.useMemo(() => chosenNow(ask), [ask])
  // The swatch each row's Tab lands on: the chosen one, else the first.
  const [cols, setCols] = React.useState(() => rows.map((r) => Math.max(0, r.id === "recent" ? 0 : r.picks.findIndex((p) => isChosen(p, now)))))
  // A click elsewhere leaves focus where it went; anything else gives it back to the text.
  const outside = React.useRef(false)
  const close = React.useCallback(() => onClose(), [onClose])
  // The shared popover, anchored where the grid was asked for (as B1's block menu is).
  const anchor = React.useMemo(() => ({ current: colourAnchorOf(ask) }), [ask])

  React.useEffect(
    () => () => {
      if (!outside.current && !ask.editor.isDestroyed) ask.editor.commands.focus()
    },
    [ask],
  )

  // Closes when the doc scrolls under it.
  React.useEffect(() => {
    const scroller = ask.editor.view.dom.closest(".doc-scroll")
    scroller?.addEventListener("scroll", close, { passive: true })
    return () => scroller?.removeEventListener("scroll", close)
  }, [ask, close])

  const at = (r: number, c: number) => ref.current?.querySelector<HTMLButtonElement>(`[data-row="${r}"][data-col="${c}"]`)
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-col]")
    if (!btn) return
    const r = Number(btn.dataset.row)
    const c = Number(btn.dataset.col)
    const last = (row: number) => rows[row].picks.length - 1
    let next: HTMLButtonElement | null | undefined
    if (e.key === "ArrowRight") next = at(r, Math.min(c + 1, last(r)))
    else if (e.key === "ArrowLeft") next = at(r, Math.max(c - 1, 0))
    else if (e.key === "ArrowDown") next = r + 1 < rows.length ? at(r + 1, Math.min(c, last(r + 1))) : null
    else if (e.key === "ArrowUp") next = r > 0 ? at(r - 1, Math.min(c, last(r - 1))) : null
    else if (e.key === "Home") next = at(r, 0)
    else if (e.key === "End") next = at(r, last(r))
    else if (e.key === "Tab") {
      // Row to row, round within the grid.
      const to = (r + (e.shiftKey ? rows.length - 1 : 1)) % rows.length
      next = at(to, cols[to])
    } else return
    e.preventDefault()
    next?.focus()
  }

  return (
    <Popover open onOpenChange={(open) => !open && close()}>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        ref={ref}
        aria-label="Colour"
        data-colour-grid=""
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        onKeyDown={onKeyDown}
        onOpenAutoFocus={(e) => {
          // Into the text colours, on the chosen one.
          e.preventDefault()
          const row = rows.findIndex((r) => r.id === "text")
          ref.current?.querySelector<HTMLButtonElement>(`[data-row="${row}"][data-col="${cols[row]}"]`)?.focus()
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={() => {
          outside.current = true
        }}
        className="content-float w-[268px] rounded-xl bg-pop p-2 shadow-e3"
      >
      {rows.map((row, r) => (
        <div key={row.id} role="group" aria-label={row.label} className={cn(r > 0 && "mt-1.5")}>
          <div aria-hidden="true" className="px-1 pb-1 text-meta font-[510] text-ink-3">
            {row.label}
          </div>
          <div className="grid grid-cols-8 gap-1">
            {row.picks.map((pick, c) => {
              const chosen = row.id !== "recent" && isChosen(pick, now)
              const label = pickLabel(pick, row.id === "recent")
              return (
                <button
                  key={`${pick.colour}-${pick.background}`}
                  type="button"
                  data-row={r}
                  data-col={c}
                  tabIndex={cols[r] === c ? 0 : -1}
                  aria-label={label}
                  aria-pressed={row.id === "recent" ? undefined : chosen}
                  title={label}
                  onFocus={() => setCols((all) => (all[r] === c ? all : all.map((v, i) => (i === r ? c : v))))}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    apply(ask, pick, true)
                    close()
                  }}
                  className={cn(
                    "grid size-7 place-items-center rounded-md outline-none transition-[background-color,box-shadow] duration-[140ms] ease-[var(--ease-out)] hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--pop)]",
                    // The chosen one's frame is an outline, so the focus ring can show over it.
                    chosen && "bg-press outline outline-[1.5px] -outline-offset-[1.5px] outline-ink-2",
                  )}
                >
                  <Swatch pick={pick} size="size-5 text-ui-sm" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
      </PopoverContent>
    </Popover>
  )
}

/** The phone's: a menu sheet of cards, each colour named under its swatch. */
function ColourSheet({ ask, onClose }: { ask: ColourAsk; onClose(): void }) {
  const [open, setOpen] = React.useState(true)
  const rows = React.useMemo(() => colourRows(recentColours()), [])
  const now = React.useMemo(() => chosenNow(ask), [ask])
  return (
    // It goes once it has slid away, so the sheet closes as every sheet does.
    <Drawer detent="menu" open={open} onOpenChange={(o) => !o && setOpen(false)} onAnimationEnd={(o) => !o && onClose()}>
      <DrawerContent
        aria-describedby={undefined}
        data-colour-sheet=""
        // Back to the text, and its keyboard, once the sheet has gone.
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          if (!ask.editor.isDestroyed) ask.editor.commands.focus()
        }}
      >
        <DrawerTitle className="sr-only">Colour</DrawerTitle>
        {rows.map((row) => (
          <SheetGroup key={row.id} label={row.label}>
            <div aria-hidden="true" className="px-4 pt-3 pb-1 text-meta font-[510] text-ink-3">
              {row.label}
            </div>
            <div className="grid grid-cols-4 gap-1 px-2 pb-2">
              {row.picks.map((pick) => {
                const chosen = row.id !== "recent" && isChosen(pick, now)
                const label = pickLabel(pick, row.id === "recent")
                return (
                  <button
                    key={`${pick.colour}-${pick.background}`}
                    type="button"
                    aria-label={label}
                    aria-pressed={row.id === "recent" ? undefined : chosen}
                    onClick={() => {
                      apply(ask, pick, false)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex h-[60px] flex-col items-center justify-center gap-1 rounded-[10px] outline-none active:bg-press focus-visible:ring-2 focus-visible:ring-brand",
                      chosen && "bg-press",
                    )}
                  >
                    <Swatch pick={pick} size="size-7 text-ui" />
                    <span className="max-w-full truncate px-1 text-micro text-ink-2">{label}</span>
                  </button>
                )
              })}
            </div>
          </SheetGroup>
        ))}
        <SheetCancel />
      </DrawerContent>
    </Drawer>
  )
}
