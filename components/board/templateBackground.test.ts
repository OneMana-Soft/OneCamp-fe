import { describe, expect, it, vi } from "vitest"
import { convertForTest } from "@/lib/testing/boardScene"

vi.mock("@excalidraw/excalidraw", () => ({ convertToExcalidrawElements: (sk: Record<string, unknown>[]) => convertForTest(sk) }))

import { insertBoardTemplate } from "./boardTools"
import { BOARD_TEMPLATES } from "@/lib/board/templates"

// miro-03 3: a template's background arrives locked, in the one path a built-in template lands by (a team's template
// lands by addCopies through the same lockedBackground). Its notes and words stay free to move.
describe("laying a template", () => {
  it("locks its frames as they land, and leaves its notes and words unlocked", async () => {
    let laid: { type: string; locked?: boolean }[] = []
    const api = {
      getAppState: () => ({ scrollX: 0, scrollY: 0, width: 1280, height: 800, zoom: { value: 1 } }),
      getSceneElements: () => [],
      updateScene: (s: { elements: typeof laid }) => {
        laid = s.elements
      },
      scrollToContent: () => {},
    }
    const retro = BOARD_TEMPLATES.find((t) => t.build("p").some((s) => s.type === "frame"))!
    await insertBoardTemplate(api as never, retro)
    const frames = laid.filter((e) => e.type === "frame")
    const rest = laid.filter((e) => e.type !== "frame")
    expect(frames.length).toBeGreaterThan(0)
    expect(frames.every((e) => e.locked === true)).toBe(true)
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.some((e) => e.locked === true)).toBe(false)
  })
})
