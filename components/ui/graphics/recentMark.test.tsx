import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { RecentMark, recentHue } from "./recentMark"
import { placeHue } from "@/lib/placeHue"

// Home's "Jump back in" and the palette's Recent list the same places, and
// drew them two ways (a project's tile at 16 and 20, a task's status glyph
// and a checkbox). One mark and one hue now draw both.
afterEach(cleanup)

describe("a recent place's mark", () => {
  it("is its identity in its hue, a task's status glyph, or an ink-3 glyph", () => {
    const mark = (type: string, id = "x1", title = "Maya Chen") => render(<RecentMark item={{ type, id, title } as never} />).container
    expect(mark("project").querySelector("[data-project-tile]")?.getAttribute("data-project-tile")).toBe("20")
    expect(mark("channel").querySelector("[data-channel-tile]")?.getAttribute("data-channel-tile")).toBe("20")
    expect(mark("doc").querySelector("[data-doc-icon]")).toBeTruthy()
    expect(mark("user").querySelector("[data-hue]")).toBeTruthy()
    expect(mark("team").querySelector("svg")?.getAttribute("class")).toMatch(/text-ink-3/)
  })

  it("tints its row in the same hue placeHue gives the place", () => {
    expect(recentHue({ type: "channel", id: "c1", title: "engineering" })).toBe(placeHue("channel", "c1"))
    expect(recentHue({ type: "doc", id: "d1", title: "Plan" })).toBe(placeHue("doc", "d1"))
    expect(recentHue({ type: "chat", id: "u1", title: "Maya Chen" })).toBe(placeHue("person", null, { person: "Maya Chen" }))
    expect(recentHue({ type: "task", id: "t1", title: "Ship" })).toBeUndefined()
  })

  it("is the one mark Home and the palette draw", () => {
    for (const f of ["components/home/HomeLists.tsx", "components/ui/CommandPalette.tsx"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8")
      expect(src, f).toMatch(/<RecentMark item=\{item\} \/>/)
      expect(src, f).toMatch(/recentHue\(item\)/)
    }
  })
})
