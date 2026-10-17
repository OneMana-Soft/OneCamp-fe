import { describe, expect, it } from "vitest"
import { GO_KEYS, goTarget, isTyping, pageTakesG } from "./goKeys"

describe("go keys", () => {
  it("map a letter to a page, and nothing else", () => {
    expect(goTarget("i")).toBe("/app/inbox")
    expect(goTarget("T")).toBe("/app/myTask")
    expect(goTarget("z")).toBeNull()
  })
  it("use each letter once", () => {
    const keys = GO_KEYS.map((g) => g.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it("stay out of the way while typing", () => {
    const input = document.createElement("input")
    const div = document.createElement("div")
    div.contentEditable = "true"
    document.body.append(input, div)
    expect(isTyping(input)).toBe(true)
    expect(isTyping(document.body)).toBe(false)
    const board = document.createElement("div")
    board.className = "excalidraw"
    const canvas = document.createElement("canvas")
    board.append(canvas)
    document.body.append(board)
    expect(isTyping(canvas)).toBe(true)
  })
  it("give way on the pages whose own keys take G", () => {
    expect(pageTakesG("/app/calendar")).toBe(true)
    expect(pageTakesG("/app/board/b1")).toBe(true)
    expect(pageTakesG("/app/calendar/booking")).toBe(false)
    expect(pageTakesG("/app/board")).toBe(false)
    expect(pageTakesG("/app/home")).toBe(false)
  })
})
