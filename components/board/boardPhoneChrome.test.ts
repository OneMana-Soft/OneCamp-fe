import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// On a phone the board's own buttons stay off Excalidraw's chrome: its tool row
// runs along the top and a column of its buttons down the right, so the
// board's share and options, its facilitation bar and Templates sit low,
// above the canvas's footer. At the top they covered the last three tools.
const page = readFileSync("app/app/board/[board-id]/page.tsx", "utf8")
const facilitation = readFileSync("components/board/boardFacilitation.tsx", "utf8")
const tools = readFileSync("components/board/boardTools.tsx", "utf8")

describe("a board on a phone", () => {
  it("keeps its own buttons low, off Excalidraw's tool row", () => {
    expect(page).toMatch(/absolute bottom-\[4\.5rem\] right-3[^"]*" data-board-phone-actions/)
    expect(facilitation).toMatch(/isMobile \? "bottom-\[7\.5rem\]" : "bottom-4"/)
    expect(facilitation).not.toMatch(/isMobile \? "top-2"/)
    expect(tools).toMatch(/max-sm:bottom-\[4\.5rem\] max-sm:left-3 max-sm:right-auto max-sm:top-auto/)
  })
})
