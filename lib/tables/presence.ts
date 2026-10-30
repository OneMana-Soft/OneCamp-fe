// Who else is on a table, and where (tables A7, Live Rows #65), drawn on the
// grid without drawing it again: one stylesheet of rules that find the cells
// by their row and field (tr[data-row] > td[data-field]). A cell someone has
// selected gets a ring in their hue, and their name when it's pointed at; one
// they're editing, a thicker ring and their name always. Pure.

import { firstNameOf } from "@/lib/personName"
import { personHue } from "@/lib/utils/getAvatarColor"

/** One person on a table, and where. */
export interface TableHere {
  user: string
  name?: string
  row?: string
  field?: string
  editing?: boolean
  at: number
}

// Rows and fields are named by uuid; anything else names no cell.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A name as a CSS string's insides: one line, its quotes and backslashes escaped. */
function cssText(s: string): string {
  return s.replace(/[\r\n\f]+/g, " ").replace(/["\\]/g, (c) => `\\${c}`)
}

/** The tag's height (the 11 px step's line), all of it past the cell's edge but the 2 px it lays on the ring. */
const TAG_H = 14
/** The frozen column's shadow, drawn past a frozen cell's right edge once the grid scrolls sideways (table.css). */
const FROZEN_SHADOW = 12

/**
 * The name tag hangs on the cell's top edge, outside it, as Sheets and
 * Airtable hang theirs; inside, at the top right, it covered the value ("1,200"
 * read "1,2…"). On the table's first row, under the sticky header, it hangs
 * from the bottom edge instead. It is the hue's ink with its tint for the
 * text: the pair the palette holds at 4.5:1 or more in both themes
 * (paletteContrast.test.ts), where white on the strong cut was under 3:1.
 */
const TAG = `position:absolute;z-index:1;right:0;bottom:calc(100% - 2px);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border-radius:4px 4px 0 0;font-size:11px;line-height:${TAG_H}px;font-weight:600;pointer-events:none`
const BELOW = "top:calc(100% - 2px);bottom:auto;border-radius:0 0 4px 4px"

/**
 * What a marked cell lets show past its edges: the tag, above it (below on
 * the first row), and nothing else, as its overflow clip did. Its z-index
 * lifts the tag over the rows beside it and keeps it under the frozen column
 * (2) and the header (4); a frozen cell's lifts it over the frozen cells
 * beside it, with room for its shadow. A cell being typed in here isn't
 * clipped: a text cell grows over the rows below.
 */
function roomFor(cell: string, first: string): string {
  const clip = ":not(:focus-within){clip-path:inset("
  return (
    `${cell}{overflow:visible;z-index:1}${cell}[data-frozen]{z-index:3}` +
    `${cell}${clip}-${TAG_H}px 0 0 0)}` +
    `${cell}[data-frozen]${clip}-${TAG_H}px -${FROZEN_SHADOW}px 0 0)}` +
    `${first}${clip}0 0 -${TAG_H}px 0)}` +
    `${first}[data-frozen]${clip}0 -${FROZEN_SHADOW}px -${TAG_H}px 0)}`
  )
}

/** The stylesheet that marks each person's cell, others only (the caller leaves me out). */
export function presenceCss(people: TableHere[]): string {
  let css = ""
  for (const p of people) {
    if (!p.row || !p.field || !ID.test(p.row) || !ID.test(p.field)) continue
    const hue = personHue(p.name || p.user)
    const cell = `tr[data-row="${p.row}"]>td[data-field="${p.field}"]`
    const first = `tr[data-index="0"][data-row="${p.row}"]>td[data-field="${p.field}"]`
    css += `${cell}{box-shadow:inset 0 0 0 ${p.editing ? 2 : 1.5}px var(--camp-${hue})}` + roomFor(cell, first)
    // Their name: always on a cell they're editing; on one they've selected, while it's pointed at.
    const tag = `content:"${cssText(firstNameOf(p.name) || "Someone")}";${TAG};background:var(--camp-${hue}-ink);color:var(--camp-${hue}-tint)`
    css += p.editing
      ? `${cell}::before{${tag}}${first}::before{${BELOW}}`
      : `@media (hover:hover){${cell}:hover::before{${tag}}${first}:hover::before{${BELOW}}}`
  }
  return css
}
