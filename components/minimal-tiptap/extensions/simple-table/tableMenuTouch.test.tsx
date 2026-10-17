import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { act, cleanup, screen } from "@testing-library/react"
import { installRangeRects } from "@/lib/testing/rangeRects"
import { docEditor, loadDocBlocks } from "../block-commands/blockTestKit"
import { insertSimpleTable } from "./simpleTable"

// A table's colours, under a finger. Menu rows are 44px tall under a finger
// (app/phone.css F3), and the swatches are menu items too, so the rule drew
// them as 36 by 44 slivers on a phone and 24 by 44 on a touch tablet, each
// still a 36 or 24px tap wide (measured in Chromium with the app's CSS). A
// swatch keeps its square, 36px under a finger, takes the shared 44px tap,
// and the swatches stand 8px apart so no tap lands on a neighbour.

beforeAll(() => loadDocBlocks(), 30_000)
let restoreRects = () => {}
beforeAll(() => {
  restoreRects = installRangeRects()
})
afterAll(() => restoreRects())
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

describe("a table's colours under a finger", () => {
  it("stay square at 36px, 8px apart, each with the shared 44px tap", async () => {
    const editor = docEditor("<p></p>")
    // A doc's editor is made with its table editing (technical/register.ts).
    insertSimpleTable(editor, { from: 1, to: 1 })
    const { openTableMenu } = await import("./TableMenu")
    await act(async () => void openTableMenu({ editor, kind: "row" }))
    const swatches = screen.getAllByRole("menuitemradio")
    expect(swatches.length).toBeGreaterThan(1)
    for (const swatch of swatches) {
      expect(swatch.hasAttribute("data-touch-target")).toBe(true)
      // Square: the menu rows' 44px height isn't a swatch's.
      expect(swatch.className.split(/\s+/)).toEqual(expect.arrayContaining(["pointer-coarse:size-9", "!min-h-0"]))
    }
    expect(swatches[0].parentElement!.className.split(/\s+/)).toContain("pointer-coarse:gap-2")
  }, 15_000)
})
