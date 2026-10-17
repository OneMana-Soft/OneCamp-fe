import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { PlaceMark, placeMarkHue } from "./placeMark"
import { recentHue } from "./recentMark"
import { hueFor } from "@/lib/campHue"
import { docHue, knownDocIcon, rememberDocIcon } from "@/lib/docLook"
import { placeHue } from "@/lib/placeHue"
import { docTreeAdapter } from "@/services/docGraphService"

afterEach(cleanup)

// One mark for a listed thing (REVIEW-FE-SHELL): the palette drew its places,
// its hits and its Recent from three maps of its own, Home from a fourth.
describe("a listed thing's mark", () => {
  it("is its identity in its hue, a task's status glyph, or its kind's ink-3 glyph", () => {
    const mark = (place: Parameters<typeof PlaceMark>[0]["place"]) => render(<PlaceMark place={place} />).container
    expect(mark({ kind: "project", id: "p1" }).querySelector("[data-project-tile]")?.getAttribute("data-project-tile")).toBe("20")
    expect(mark({ kind: "channel", id: "c1", isPrivate: true }).querySelector("svg")?.getAttribute("class")).toMatch(/lucide-lock/)
    expect(mark({ kind: "doc", id: "d1" }).querySelector("[data-doc-icon]")).toBeTruthy()
    expect(mark({ kind: "person", label: "Maya Chen" }).querySelector("[data-hue]")).toBeTruthy()
    for (const kind of ["team", "board", "message", "reply", "file"] as const) expect(mark({ kind }).querySelector("svg")?.getAttribute("class"), kind).toMatch(/text-ink-3/)
  })

  it("tints its row in the hue placeHue gives the place, and none for a kind with no identity", () => {
    expect(placeMarkHue({ kind: "channel", id: "c1" })).toBe(placeHue("channel", "c1"))
    expect(placeMarkHue({ kind: "project", id: "p1" })).toBe(placeHue("project", "p1"))
    expect(placeMarkHue({ kind: "person", label: "Maya Chen" })).toBe(placeHue("person", null, { person: "Maya Chen" }))
    for (const kind of ["task", "team", "board", "message", "reply", "file"] as const) expect(placeMarkHue({ kind })).toBeUndefined()
  })

  it("is the one the palette draws: no glyph map of its own", () => {
    const src = readFileSync(join(process.cwd(), "components/ui/CommandPalette.tsx"), "utf8")
    expect(src).not.toMatch(/TARGET_GLYPH|HIT_GLYPH|RECENT_GLYPH/)
    expect(src).toMatch(/<PlaceMark place=\{targetPlace\(t\)\} \/>/)
    expect(src).toMatch(/<PlaceMark place=\{hitPlace\(result\)\} \/>/)
    expect(readFileSync(join(process.cwd(), "components/ui/graphics/recentMark.tsx"), "utf8")).toMatch(/<PlaceMark place=\{placeOf\(item\)\} \/>/)
  })
})

// REVIEW-FE-SHELL db2 F7: Starred, Recent, the palette and Later drew a doc in
// its id's hue while the tree and search drew its glyph's colour.
describe("one doc, one colour", () => {
  const id = ["d1", "d2", "d3", "d4", "d5", "d6", "d7"].find((d) => hueFor(d) !== "sun")!
  const sun = "glyph:page:sun"
  const level = (icon?: string) => ({ msg: "ok", data: { parent: "", nodes: [{ kind: "doc", uuid: id, title: "Plan", has_children: false, ...(icon ? { icon } : {}) }], hidden: 0 } })

  it("is the glyph's colour in Recent, the palette's places and Later once the tree has shown the doc", () => {
    docTreeAdapter("workspace").read(level(sun) as never)
    expect(knownDocIcon(id)).toBe(sun)
    expect(docHue(id, sun)).toBe("sun")
    expect(recentHue({ type: "doc", id, title: "Plan" })).toBe("sun")
    expect(placeMarkHue({ kind: "doc", id })).toBe("sun")
  })

  it("follows the tree when the icon goes, and a source that carries one wins", () => {
    rememberDocIcon(id, sun)
    docTreeAdapter("workspace").read(level() as never)
    expect(knownDocIcon(id)).toBeUndefined()
    expect(placeMarkHue({ kind: "doc", id })).toBe(docHue(id))
    // A search hit carries the doc's icon, its absence too (null), over what was last seen.
    rememberDocIcon(id, sun)
    expect(placeMarkHue({ kind: "doc", id, icon: null })).toBe(docHue(id))
    rememberDocIcon(id, undefined)
  })
})
