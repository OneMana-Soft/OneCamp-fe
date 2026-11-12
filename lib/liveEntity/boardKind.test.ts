import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ViewContext } from "@/lib/liveEntity"

// The "board" chip kind (CR-B19 row 2668, M1): a doc's whiteboard block and an event's files both draw a board
// as a chip, each from its own lazy chunk. The registry throws on a second registration of a name, so a session
// that opened a doc's whiteboard and then an event's files lost the event's edit kit when two modules each
// registered "board". Whichever surface comes first, the kind is the one spec, registered once.

const SURFACES = {
  "a doc's whiteboard block": () => import("@/components/minimal-tiptap/extensions/whiteboard-embed/WhiteboardEmbedView"),
  "an event's files": () => import("@/components/calendar/fileChips"),
}
type Surface = keyof typeof SURFACES

describe("the board chip kind", () => {
  // A fresh registry for each order: the modules a session loaded are loaded again from nothing.
  beforeEach(() => vi.resetModules())

  const orders: Array<[Surface, Surface]> = [
    ["a doc's whiteboard block", "an event's files"],
    ["an event's files", "a doc's whiteboard block"],
  ]
  it.each(orders)("is registered once, the same, when %s loads before %s", async (first, second) => {
    await expect(SURFACES[first]()).resolves.toBeDefined()
    await expect(SURFACES[second]()).resolves.toBeDefined()
    const { entityKind } = await import("@/lib/liveEntity")
    const { Presentation } = await import("@/lib/icons")
    const board = entityKind<{ title?: string }>("board")
    expect(board, "a board kind").toBeDefined()
    expect(board!.icon).toBe(Presentation)
    expect(board!.noun).toBe("board")
    const ctx: ViewContext = { today: "" } // a board's chip reads no date
    expect(board!.view({ title: "Launch flow" }, "b1", ctx)).toEqual({ title: "Launch flow" })
    expect(board!.view({}, "b1", ctx)).toEqual({ title: "Untitled board" })
    expect(board!.href("b1")).toBe("/app/board/b1")
  })
})
