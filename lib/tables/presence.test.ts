import { describe, expect, it } from "vitest"
import { presenceCss } from "./presence"

const row = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b"
const field = "11111111-2222-4333-8444-555555555555"
const cell = `tr[data-row="${row}"]>td[data-field="${field}"]`

// Others' cells on the grid (tables A7): a ring in their hue where they are,
// a tag with their name where they're editing (and where they've selected,
// while it's pointed at), and nothing for anything that isn't a cell.
describe("who else is where on a table", () => {
  it("rings the cell someone has selected, in their hue, and names them only while it's pointed at", () => {
    const css = presenceCss([{ user: "u1", name: "Maya Chen", row, field, at: 1 }])
    expect(css).toContain(`${cell}{box-shadow:inset 0 0 0 1.5px var(--camp-`)
    expect(css).toMatch(new RegExp(`@media \\(hover:hover\\)\\{${cell.replace(/[[\]().*"]/g, "\\$&")}:hover::before\\{content:"Maya"`))
    expect(css).not.toContain(`${cell}::before`)
  })

  it("tags the cell someone is editing with their first name", () => {
    const css = presenceCss([{ user: "u1", name: "Maya Chen", row, field, editing: true, at: 1 }])
    expect(css).toContain(`${cell}::before{content:"Maya"`)
    expect(css).toContain("inset 0 0 0 2px")
  })

  // DESIGN-BUILD-3 (20 Oct): the tag sat inside the cell, top right, and
  // covered its value ("1,200" read "1,2…"); white on the strong cut was under 3:1.
  it("hangs the tag outside the cell, on its top edge, in the hue's ink with its tint for the text", () => {
    const css = presenceCss([{ user: "u1", name: "Maya Chen", row, field, editing: true, at: 1 }])
    const tag = css.slice(css.indexOf(`${cell}::before{`)).split("}")[0]
    expect(tag).toContain("bottom:calc(100% - 2px)")
    expect(tag).not.toMatch(/(^|;)top:0/)
    expect(tag).toMatch(/background:var\(--camp-(sun|moss|lake|sky|dusk|berry)-ink\);color:var\(--camp-\1-tint\)/)
    expect(tag).not.toContain("#fff")
    // The cell lets the tag show above it, and nothing else past its edges.
    expect(css).toContain(`${cell}{overflow:visible;z-index:1}`)
    expect(css).toContain(`${cell}:not(:focus-within){clip-path:inset(-14px 0 0 0)}`)
    // On the first row, under the sticky header, it hangs below instead.
    expect(css).toContain(`tr[data-index="0"][data-row="${row}"]>td[data-field="${field}"]::before{top:calc(100% - 2px);bottom:auto`)
    expect(css).toContain(`tr[data-index="0"][data-row="${row}"]>td[data-field="${field}"]:not(:focus-within){clip-path:inset(0 0 -14px 0)}`)
  })

  it("names no cell for what isn't one, and keeps a name inside its string", () => {
    expect(presenceCss([{ user: "u1", name: "Maya", row: '"]{}*{display:none}', field, at: 1 }])).toBe("")
    expect(presenceCss([{ user: "u1", name: "Maya", at: 1 }])).toBe("")
    const css = presenceCss([{ user: "u1", name: 'Ma"ya\\ \n Chen', row, field, editing: true, at: 1 }])
    expect(css).toContain('content:"Ma\\"ya\\\\"')
    expect(presenceCss([{ user: "u1", row, field, editing: true, at: 1 }])).toContain('content:"Someone"')
  })
})
