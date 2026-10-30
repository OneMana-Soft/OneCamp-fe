import { readFileSync } from "node:fs"
import { join } from "node:path"
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import { SaveDot } from "./SaveDot"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// DB-21 (27 Oct, on F3): the dot that says a save is on its way breathed from ink-4, 1.92:1 on the page at its
// peak, a state no one could make out. It breathes from ink-3 now, in a doc's, a board's and a table's header, and
// in a saving table cell alike.
describe("the save dot while a save is on its way", () => {
  it("breathes from ink-3 once the save has lasted 700 ms", () => {
    vi.useFakeTimers()
    const { container } = render(
      <TooltipProvider>
        <SaveDot state="saving" />
      </TooltipProvider>,
    )
    act(() => void vi.advanceTimersByTime(700))
    expect(container.querySelector(".content-save-pulse")?.classList.contains("bg-ink-3")).toBe(true)
  })

  it("is the ink of a saving table cell's dot", () => {
    const css = readFileSync(join(__dirname, "../table/table.css"), "utf8")
    const rule = css.slice(css.indexOf("[data-saving]::before {"))
    expect(rule.slice(0, rule.indexOf("}"))).toContain("background: var(--ink-3);")
  })
})
