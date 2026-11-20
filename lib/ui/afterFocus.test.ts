import { afterEach, describe, expect, it, vi } from "vitest"
import { afterFocus, revealRow } from "@/lib/ui/listNav"

// fluid-17 part 2, last step (FLUIDITY-28): the list's focus listeners' writes wait while a key's focus() runs and
// run once, in order, as soon as it returns; with no key's focus under way they run at once.
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

const rowAt = (id: string) => {
  const el = document.createElement("div")
  el.tabIndex = -1
  el.dataset.taskId = id
  document.body.append(el)
  return el
}

describe("afterFocus", () => {
  it("runs a write at once when no key's focus is under way", () => {
    const done: string[] = []
    afterFocus(() => done.push("now"))
    expect(done).toEqual(["now"])
  })

  it("holds the writes made inside a key's focus() and runs them once, in order, right after it returns; a nested reveal keeps the order", () => {
    const a = rowAt("a")
    const b = rowAt("b")
    const done: string[] = []
    a.addEventListener("focus", () => {
      afterFocus(() => done.push("1"))
      revealRow(b)
      afterFocus(() => done.push("3"))
      expect(done, "nothing runs inside the focus").toEqual([])
    })
    b.addEventListener("focus", () => afterFocus(() => done.push("2")))
    revealRow(a)
    expect(done).toEqual(["1", "2", "3"])
    afterFocus(() => done.push("4"))
    expect(done, "and afterwards at once again").toEqual(["1", "2", "3", "4"])
  })

  it("is not left holding when focus() throws: the held writes still run, and later writes run at once", () => {
    const a = rowAt("a")
    const done: string[] = []
    vi.spyOn(a, "focus").mockImplementation(() => {
      afterFocus(() => done.push("held"))
      throw new Error("focus failed")
    })
    expect(() => revealRow(a)).toThrow("focus failed")
    expect(done).toEqual(["held"])
    afterFocus(() => done.push("after"))
    expect(done).toEqual(["held", "after"])
  })

  it("runs every held write exactly once when one of them throws, and reports the error as a listener's would be", () => {
    const a = rowAt("a")
    const done: string[] = []
    const reported: Array<() => void> = []
    vi.spyOn(globalThis, "queueMicrotask").mockImplementation((report) => void reported.push(report))
    a.addEventListener("focus", () => {
      // A write a held write makes goes after the ones held before it.
      afterFocus(() => (done.push("1"), afterFocus(() => done.push("4"))))
      afterFocus(() => {
        done.push("2")
        throw new Error("write failed")
      })
      afterFocus(() => done.push("3"))
    })
    revealRow(a)
    expect(done).toEqual(["1", "2", "3", "4"])
    expect(reported).toHaveLength(1)
    expect(reported[0]).toThrow("write failed")
    afterFocus(() => done.push("5"))
    expect(done, "not left holding").toEqual(["1", "2", "3", "4", "5"])
  })

  it("holds nothing for a reveal that does not focus", () => {
    const a = rowAt("a")
    const done: string[] = []
    a.addEventListener("focus", () => afterFocus(() => done.push("focus")))
    revealRow(a, false)
    expect(document.activeElement).not.toBe(a)
    afterFocus(() => done.push("now"))
    expect(done).toEqual(["now"])
  })
})
