import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// content.md B11: a board that is opening, gone, or couldn't be loaded says
// so in the product's own states. The page said "Board not found or access
// denied." in grey text for all three (a dropped connection included), with
// no way back and nothing to retry, and opened on a bare spinner.
const src = readFileSync("app/app/board/[board-id]/page.tsx", "utf8")

describe("a board's own states", () => {
  it("opens on the dot ground with a line, not a lone spinner", () => {
    expect(src).toMatch(/data-board-opening=""/)
    expect(src).toMatch(/Opening the board…/)
  })

  it("says a board that isn't the reader's, or is gone, or didn't load, as every screen does, with the way back", () => {
    expect(src).not.toMatch(/Board not found or access denied/)
    // components/ui/load-failure-state draws the three (its own test holds the words).
    expect(src).toMatch(/<LoadFailureState\s+error=\{boardError\}\s+noun="board"\s+onRetry=/)
    expect(src).toMatch(/Back to boards/)
  })

  it("keeps the global toast quiet, since the board says it in place", () => {
    expect(src).toMatch(/OWN_ERRORS/)
  })

  it("lets the template card wait for the drawing, and step aside for the AI composer", () => {
    expect(src).toMatch(/<BoardTools [^>]*synced=\{synced\}[^>]*quiet=\{aiOpen\}/)
  })
})
