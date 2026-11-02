import { describe, expect, it } from "vitest"
import { windowRead, type WindowReadRules } from "@/lib/tables/windowReads"

// The next read of a view the server answers in windows (airtable-04): on
// from what's held by its cursor, back before it by place, or a jump straight
// to a far place, the window there and none between.

const rules = (o: Partial<WindowReadRules> = {}): WindowReadRules => ({ end: 100_000, around: 250, window: 500, jumps: true, ...o })
const sight = (first: number, last: number) => ({ first, last })

describe("the next read of a view read in windows", () => {
  it("reads the first window first, wherever the view is", () => {
    expect(windowRead({ from: 0, held: 0, next: "" }, sight(5000, 5016), rules())).toEqual({ read: "on" })
  })

  it("reads on by its cursor near the end of what's held, and holds when what's in sight is read", () => {
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(300, 316), rules())).toEqual({ read: "on" })
    // Within a window past the rows held: on, never a jump.
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(800, 816), rules())).toEqual({ read: "on" })
    expect(windowRead({ from: 0, held: 1000, next: "c" }, sight(300, 316), rules())).toBeNull()
  })

  it("jumps straight to the end of 100,000 rows when a scrollbar is dragged there", () => {
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(99_984, 99_999), rules())).toEqual({ read: "jump", at: 99_734 })
    // Landed there, the view's end in its run: nothing more to read.
    expect(windowRead({ from: 99_734, held: 266, next: null }, sight(99_984, 99_999), rules())).toBeNull()
  })

  it("reads back a window by place as the view scrolls up from a jump, never below the first row", () => {
    expect(windowRead({ from: 99_734, held: 266, next: null }, sight(99_700, 99_716), rules())).toEqual({ read: "back", at: 99_234, n: 500 })
    expect(windowRead({ from: 300, held: 500, next: "c" }, sight(100, 116), rules())).toEqual({ read: "back", at: 0, n: 300 })
  })

  it("jumps again to a place far above or below what's held", () => {
    expect(windowRead({ from: 99_734, held: 266, next: null }, sight(10, 26), rules())).toEqual({ read: "jump", at: 0 })
    expect(windowRead({ from: 2250, held: 1000, next: "c" }, sight(50_000, 50_016), rules())).toEqual({ read: "jump", at: 49_750 })
  })

  it("reads nothing past the view's end, and on past what's held before a filtered view is counted", () => {
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(600, 616), rules({ end: 500 }))).toBeNull()
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(499, 499), rules({ end: Infinity }))).toEqual({ read: "on" })
  })

  it("only reads on where it may not jump (a grouped view, or a server that reads no place)", () => {
    expect(windowRead({ from: 0, held: 500, next: "c" }, sight(99_984, 99_999), rules({ jumps: false }))).toEqual({ read: "on" })
    expect(windowRead({ from: 0, held: 100_000, next: null }, sight(99_984, 99_999), rules({ jumps: false }))).toBeNull()
  })
})
