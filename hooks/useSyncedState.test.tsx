import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import type { Dispatch, SetStateAction } from "react"

import { useSyncedState } from "@/hooks/useSyncedState"

afterEach(cleanup)

type Answer = { label: string; items: string[] }

function setup(first: Answer, derive = vi.fn((a: Answer) => a.label)) {
  const seen: string[] = []
  let set: Dispatch<SetStateAction<string>> = () => {}
  function Probe({ answer }: { answer: Answer }) {
    const [label, setLabel] = useSyncedState(answer, derive)
    seen.push(label)
    set = setLabel
    return <span>{label}</span>
  }
  const view = render(<Probe answer={first} />)
  return {
    seen,
    derive,
    raw: () => set,
    set: (v: SetStateAction<string>) => act(() => set(v)),
    next: (a: Answer) => view.rerender(<Probe answer={a} />),
  }
}

describe("useSyncedState", () => {
  it("shows a new source in the same draw, with no draw after it", () => {
    const p = setup({ label: "a", items: [] })
    p.next({ label: "b", items: [] })
    // One draw per source: an effect copying it drew "a" again, then "b".
    expect(p.seen).toEqual(["a", "b"])
  })

  it("keeps a change made here until the source changes, then follows the source", () => {
    const p = setup({ label: "a", items: [] })
    p.set("mine")
    expect(p.seen.at(-1)).toBe("mine")
    p.next({ label: "b", items: [] })
    expect(p.seen.at(-1)).toBe("b")
  })

  it("keeps a change made here while the source is the same object", () => {
    const answer = { label: "a", items: [] }
    const p = setup(answer)
    p.set("mine")
    p.next(answer)
    expect(p.seen.at(-1)).toBe("mine")
    // derive runs once per source, not once per draw.
    expect(p.derive).toHaveBeenCalledTimes(1)
  })

  it("stacks updates from what is shown, a change made here or the source's", () => {
    const p = setup({ label: "a", items: [] })
    p.set((v) => v + "1")
    p.set((v) => v + "2")
    expect(p.seen.at(-1)).toBe("a12")
    p.next({ label: "b", items: [] })
    p.set((v) => v + "3")
    expect(p.seen.at(-1)).toBe("b3")
  })

  it("stacks updates sent in one go", () => {
    const p = setup({ label: "a", items: [] })
    // Two in one event, as a list adds two rows, draw once with both.
    act(() => {
      p.raw()((v) => v + "1")
      p.raw()((v) => v + "2")
    })
    expect(p.seen).toEqual(["a", "a12"])
  })
})
