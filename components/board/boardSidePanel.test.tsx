import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"
import { BoardSidePanel } from "./boardSidePanel"

// The board's side panel (Frames, Filter by tag): one shell, its actions pinned under its one scroller.

let off = () => {}
afterEach(() => {
  cleanup()
  off()
  off = () => {}
})

const actions = (sheet: boolean) => <button type="button">{sheet ? "Select these (sheet)" : "Select these"}</button>

describe("the board's side panel", () => {
  it("is a named panel on a computer, its count and close in its header, its actions pinned under the scroller", () => {
    const onClose = vi.fn()
    render(
      <BoardSidePanel name="Filter by tag" closeLabel="Close Filter by tag" count={3} footer={actions} onClose={onClose} data-tag-filter="">
        <ul aria-label="Rows" />
      </BoardSidePanel>,
    )
    const panel = screen.getByRole("complementary", { name: "Filter by tag" })
    expect(panel.hasAttribute("data-tag-filter")).toBe(true)
    expect(panel.querySelector("header")?.textContent).toContain("3")
    fireEvent.click(screen.getByRole("button", { name: "Close Filter by tag" }))
    expect(onClose).toHaveBeenCalledOnce()
    // The footer is the scroller's sibling, never inside it: a long list scrolls under it.
    const rows = screen.getByRole("list", { name: "Rows" })
    const scroller = rows.parentElement!
    expect(scroller.className).toContain("overflow-y-auto")
    const foot = panel.querySelector("[data-board-panel-footer]")!
    expect(foot.parentElement).toBe(panel)
    expect(scroller.contains(foot)).toBe(false)
    expect(foot.textContent).toBe("Select these")
  })

  it("has no footer when there's nothing to do, and no count when it lists nothing", () => {
    render(
      <BoardSidePanel name="Frames" closeLabel="Close frames" count={0} footer={() => false} onClose={vi.fn()} data-frames-panel="">
        <p>No frames yet</p>
      </BoardSidePanel>,
    )
    const panel = screen.getByRole("complementary", { name: "Frames" })
    expect(panel.querySelector("[data-board-panel-footer]")).toBeNull()
    expect(panel.querySelector("header")?.textContent).toBe("Frames")
  })

  it("is a sheet on a phone, its actions in the sheet's pinned footer, told they're on a sheet", () => {
    off = putOnScreen(SCREENS["a phone in portrait"])
    render(
      <BoardSidePanel name="Filter by tag" closeLabel="Close Filter by tag" detent="medium" footer={actions} onClose={vi.fn()} data-tag-filter="">
        <ul aria-label="Rows" />
      </BoardSidePanel>,
    )
    const sheet = document.querySelector("[data-tag-filter]")!
    expect(sheet.hasAttribute("data-v3-sheet")).toBe(true)
    expect(sheet.getAttribute("data-detent")).toBe("medium")
    const foot = sheet.querySelector("[data-sheet-footer]")!
    expect(foot.textContent).toBe("Select these (sheet)")
    expect(sheet.querySelector("[data-sheet-body]")?.contains(foot)).toBe(false)
  })
})
