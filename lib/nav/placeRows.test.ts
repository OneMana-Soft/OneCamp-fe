import { describe, expect, it } from "vitest"
import { LayoutDashboard } from "@/lib/icons"
import type { Place } from "@/types/docGraph"
import { placeRows, recentPlacesKey } from "./placeRows"

const star = (resource_kind: string, resource_uuid: string, title: string, extra: Partial<Place> = {}): Place => ({
  kind: "star",
  resource_kind,
  resource_uuid,
  position: "",
  title,
  href: "",
  ...extra,
})

// Starred and recent places as sidebar rows (miro-46): docs and boards, in
// the order the server gave them, each opening where the server says.
describe("a place's sidebar row", () => {
  it("draws a doc with its own glyph and a board with the boards' icon, in order", () => {
    const rows = placeRows([star("doc", "d1", "Launch plan", { icon: "🚀", href: "/app/doc/d1" }), star("board", "b1", "Q4 launch", { href: "/app/board/b1" })], ["", "app", "home"])
    expect(rows).toEqual([
      { title: "Launch plan", path: "/app/doc/d1", hue_id: "d1", variant: "ghost", kind: "doc", doc_icon: "🚀" },
      { title: "Q4 launch", path: "/app/board/b1", hue_id: "b1", variant: "ghost", icon: LayoutDashboard },
    ])
  })

  it("is the current row on its own page, and only there", () => {
    const places = [star("board", "b1", "Q4 launch"), star("doc", "b1x", "Notes"), star("board", "b2", "Retro")]
    const rows = placeRows(places, ["", "app", "board", "b1"])
    expect(rows.map((r) => r.variant)).toEqual(["sidebarActive", "ghost", "ghost"])
    // A doc with the board's id is not the board.
    expect(placeRows([star("doc", "b1", "Notes")], ["", "app", "board", "b1"])[0].variant).toBe("ghost")
  })

  it("opens a place the server sent no link for at its own page, and names an untitled one", () => {
    const rows = placeRows([star("board", "b9", ""), star("doc", "d9", "")], [])
    expect(rows.map((r) => [r.title, r.path])).toEqual([
      ["Untitled board", "/app/board/b9"],
      ["Untitled", "/app/doc/d9"],
    ])
  })

  it("leaves out what the sidebar can't open, and holes in the list", () => {
    const rows = placeRows([star("task", "t1", "Ship it"), null, undefined, star("board", "b1", "Q4 launch")], [])
    expect(rows.map((r) => r.title)).toEqual(["Q4 launch"])
  })
})

describe("what the person opened lately", () => {
  it("is asked for one kind, a sidebar's worth", () => {
    expect(recentPlacesKey("board")).toBe("/places/recent?resource_kind=board&limit=5")
  })
})
