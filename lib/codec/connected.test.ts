import { describe, expect, it } from "vitest"
import { readConnectedBlock, typedConnectedAttr, writeConnectedBlock } from "./connected"

// A doc's HTML or JSON can name any block at all. A name that every JavaScript object answers to ("constructor",
// "toString", "__proto__") is no block of ours: read, it is no block, and written, nothing (CR-204's H-b review:
// the tables answered for them, so a read threw and a write put a function's source in data-type).
const ID = "b0a4d000-0000-4000-8000-0000000000b1"
const NAMES = ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]

/** A div as the reader sees it: only its attributes. */
const div = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null }) as unknown as Element

describe("a connected block's name", () => {
  it("is read as one of the codec's own blocks, or as no block", () => {
    expect(readConnectedBlock("whiteboard-embed", div({ "data-board-id": ID }))).toMatchObject({ type: "whiteboardEmbed", attrs: { boardId: ID } })
    for (const name of NAMES) expect(readConnectedBlock(name, div({})), name).toBeNull()
  })

  it("is written only for the codec's own blocks", () => {
    const out: string[] = []
    expect(writeConnectedBlock(out, { type: "whiteboardEmbed", attrs: { boardId: ID } } as never)).toBe(true)
    expect(out.join("")).toContain('data-type="whiteboard-embed"')
    for (const name of NAMES) {
      const none: string[] = []
      expect(writeConnectedBlock(none, { type: name, attrs: {} } as never), name).toBe(false)
      expect(none, name).toEqual([])
    }
  })

  it("types an id only for the codec's own blocks", () => {
    expect(typedConnectedAttr("whiteboardEmbed", "boardId", ID)).toBe(ID)
    for (const name of NAMES) expect(typedConnectedAttr(name, "attr", ID), name).toBeUndefined()
  })
})
