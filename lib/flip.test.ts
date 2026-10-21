import { afterEach, describe, expect, it, vi } from "vitest"
import { measureFlip, playFlip } from "./flip"

// A row of views (split view) whose views hold FLIP rows of their own (a
// project's task list beside the page): a move is played on the views alone.
// Measured and played as well, the rows inside a moved view went twice the
// distance, the view's move and their own.
const rect = (left: number) => ({ left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, x: left, y: 0, toJSON() {} }) as DOMRect

function row() {
  document.body.innerHTML = `<div id="row"><section data-flip-id="main"><div data-flip-id="t1"></div></section><section data-flip-id="doc:a"><div data-flip-id="t2"></div></section></div>`
  const at = new Map<string, number>([
    ["main", 0],
    ["t1", 10],
    ["doc:a", 200],
    ["t2", 210],
  ])
  for (const el of document.querySelectorAll<HTMLElement>("[data-flip-id]")) {
    el.getBoundingClientRect = () => rect(at.get(el.dataset.flipId ?? "") ?? 0)
    el.animate = vi.fn() as unknown as HTMLElement["animate"]
  }
  return { root: document.getElementById("row") as HTMLElement, at }
}

const played = (root: HTMLElement, id: string) => (root.querySelector<HTMLElement>(`[data-flip-id="${id}"]`)?.animate as unknown as ReturnType<typeof vi.fn>).mock.calls.length

afterEach(() => {
  document.body.innerHTML = ""
  vi.unstubAllGlobals()
})

describe("FLIP over a row of views", () => {
  it("measures, and so plays, only the ids it is given", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }))
    const { root, at } = row()
    const before = measureFlip(root, new Set(["main", "doc:a"]))
    expect([...before.keys()]).toEqual(["main", "doc:a"])
    // The two views swap places, and what each holds goes with it.
    at.set("main", 200).set("t1", 210).set("doc:a", 0).set("t2", 10)
    expect(playFlip(root, before, { duration: 200 })).toBe(2)
    expect(["main", "doc:a", "t1", "t2"].map((id) => played(root, id))).toEqual([1, 1, 0, 0])
  })

  it("measures every id without a list, as the lists that flip their own rows do", () => {
    const { root } = row()
    expect([...measureFlip(root).keys()]).toEqual(["main", "t1", "doc:a", "t2"])
  })
})
