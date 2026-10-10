import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { PanelErrorBoundary } from "./PanelErrorBoundary"

// A panel whose data came back in a shape it didn't expect took the whole app
// down: the right panel and the split panes live in the frame, past the
// page's own error screen. Now the panel says so in its own space.
afterEach(cleanup)

let broken = true
function Task() {
  if (broken) throw new Error("task_assignee is not an array")
  return <p>Write the launch announcement</p>
}

describe("a panel's crash", () => {
  it("stays in the panel, with Try again and a way to close it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    broken = true
    const onClose = vi.fn()
    render(
      <div>
        <p>The page</p>
        <PanelErrorBoundary resetKey="t1" onClose={onClose}>
          <Task />
        </PanelErrorBoundary>
      </div>,
    )
    expect(screen.getByText("The page")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toMatch(/This panel hit a problem/)
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }))
    expect(onClose).toHaveBeenCalled()
    broken = false
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(screen.getByText("Write the launch announcement")).toBeTruthy()
  })

  it("starts over when the panel shows something else", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    broken = true
    const { rerender } = render(<PanelErrorBoundary resetKey="t1"><Task /></PanelErrorBoundary>)
    expect(screen.getByRole("alert")).toBeTruthy()
    broken = false
    rerender(<PanelErrorBoundary resetKey="t2"><Task /></PanelErrorBoundary>)
    expect(screen.getByText("Write the launch announcement")).toBeTruthy()
  })

  it("guards the right panel and every split pane", () => {
    const root = join(__dirname, "..", "..")
    expect(readFileSync(join(root, "app/app/LayoutContent.tsx"), "utf8")).toMatch(/<PanelErrorBoundary[\s\S]{0,200}<RightPanel \/>/)
    expect(readFileSync(join(root, "components/split/SplitPane.tsx"), "utf8")).toMatch(/<PanelErrorBoundary[\s\S]{0,200}<PaneBody/)
  })
})
