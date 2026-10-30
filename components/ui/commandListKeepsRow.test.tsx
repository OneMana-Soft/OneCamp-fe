import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import * as React from "react"

import { CommandList, type CommandListHandle } from "@/components/ui/CommandList"

afterEach(cleanup)

const rows = (...ids: string[]) => ids.map((id) => ({ id, label: id }))

function list(query?: string) {
  const ref = React.createRef<CommandListHandle>()
  const draw = (ids: string[], q = query) => <CommandList ref={ref} label="Insert" items={rows(...ids)} query={q} onSelect={vi.fn()} />
  return { ref, draw }
}

const down = (ref: React.RefObject<CommandListHandle | null>, times: number) => {
  for (let n = 0; n < times; n++) act(() => void ref.current!.onKeyDown(new KeyboardEvent("keydown", { key: "ArrowDown" })))
}

const highlighted = (c: HTMLElement) => c.querySelector('[role=option][aria-selected="true"]')?.textContent

// CR-17's SF3 on the late "/" fix: a conversation's commands can arrive while
// the menu is open, and the list used to jump to its top when they did, so
// Enter could take a row the person never saw highlighted.
describe("a CommandList whose rows change under the same query", () => {
  it("keeps the highlighted row by id", () => {
    const { ref, draw } = list("")
    const { container, rerender } = render(draw(["text", "h1", "h2"]))
    down(ref, 2)
    expect(highlighted(container)).toBe("h2")
    rerender(draw(["text", "h1", "h2", "standup"]))
    expect(highlighted(container)).toBe("h2")
    rerender(draw(["standup", "text", "h1", "h2"]))
    expect(highlighted(container)).toBe("h2")
  })

  it("starts at the top when that row is gone", () => {
    const { ref, draw } = list("")
    const { container, rerender } = render(draw(["text", "h1", "h2"]))
    down(ref, 2)
    rerender(draw(["standup", "text"]))
    expect(highlighted(container)).toBe("standup")
  })

  it("starts at the top when the query changes", () => {
    const { ref, draw } = list("")
    const { container, rerender } = render(draw(["text", "h1", "h2"]))
    down(ref, 2)
    rerender(draw(["h1", "h2"], "h"))
    expect(highlighted(container)).toBe("h1")
  })

  it("starts at the top when the caller filters without telling it the query", () => {
    const { ref, draw } = list()
    const { container, rerender } = render(draw(["a", "b", "c"]))
    down(ref, 1)
    expect(highlighted(container)).toBe("b")
    rerender(draw(["x", "a", "b", "c"]))
    expect(highlighted(container)).toBe("x")
  })
})
