import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { TooltipProvider } from "@/components/ui/tooltip"
import { closeRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { RightPanelFrame } from "./panelFrame"

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }))
vi.mock("react-redux", () => ({ useDispatch: () => dispatch }))

// V-180, DB-71's MUST 1: a right panel whose code was still coming could be closed only by Escape, which nobody sees:
// its head's Close was a grey block over the shape, and the slow line had no head at all. The right panel's frame draws
// the head with the live Close from the first frame, over the shape, the slow line and a failure alike.

afterEach(() => {
  cleanup()
  dispatch.mockClear()
})

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8")

function framed(busy: boolean) {
  const { container } = render(
    <TooltipProvider>
      <RightPanelFrame busy={busy}>
        <p>The state</p>
      </RightPanelFrame>
    </TooltipProvider>,
  )
  const frame = container.querySelector("[data-panel-frame]") as HTMLElement
  return { frame, head: frame.querySelector("header") as HTMLElement }
}

describe("the right panel's frame for a panel that isn't in yet", () => {
  it("closes the panel by mouse from the first frame, its glyph and title still to come while the shape shows", () => {
    const { frame, head } = framed(true)
    expect(frame.getAttribute("aria-busy")).toBe("true")
    expect(head.className).toContain("h-[52px]")
    expect(head.firstElementChild?.childElementCount).toBe(2)
    expect(screen.getByText("The state").closest("header")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }))
    expect(dispatch).toHaveBeenCalledWith(closeRightPanel())
  })

  it("keeps Close over the slow line and a failure, with nothing loading in the head", () => {
    const { frame, head } = framed(false)
    expect(frame.getAttribute("aria-busy")).toBe("false")
    expect(head.firstElementChild?.childElementCount).toBe(0)
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }))
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it("is the frame of every panel the right panel draws, and its Close is the header's own", () => {
    expect(source("components/rightPanel/rightPanel.tsx")).toContain("<PanelFrame.Provider value={RightPanelFrame}>{renderRightPanel()}</PanelFrame.Provider>")
    const header = source("components/rightPanel/rightPanelHeader.tsx")
    expect(header).toContain("<PanelClose />")
    expect(header).not.toContain('aria-label="Close panel"')
  })
})
