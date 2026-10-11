import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// On a phone the board's own buttons stay off Excalidraw's chrome: its tool row
// runs along the top and a column of its buttons down the right, so the
// board's one cluster (AI, comment, share, options), its facilitation bar and
// the notes bar sit low, above the canvas's footer. At the top they covered
// the last three tools.
const page = readFileSync("app/app/board/[board-id]/page.tsx", "utf8")
const facilitation = readFileSync("components/board/boardFacilitation.tsx", "utf8")
const tools = readFileSync("components/board/boardTools.tsx", "utf8")

describe("a board on a phone", () => {
  it("keeps its own buttons low, off Excalidraw's tool row", () => {
    expect(page).toMatch(/absolute bottom-\[5rem\] right-3[^"]*" data-board-phone-actions/)
    expect(facilitation).toMatch(/isMobile \? "bottom-\[8\.5rem\]" : "bottom-\[72px\]"/)
    expect(facilitation).not.toMatch(/isMobile \? "top-2"/)
    expect(tools).toMatch(/max-sm:top-auto max-sm:bottom-\[8\.5rem\]/)
  })
  it("gives each button a 36 px target in a 44 px cluster", () => {
    expect(page).toMatch(/h-11 rounded-\[14px\] \[&_button\]:size-9/)
  })
})
