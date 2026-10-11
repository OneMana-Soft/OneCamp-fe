import { readFileSync } from "node:fs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

import { TooltipProvider } from "@/components/ui/tooltip"
import { BoardName, BoardTitleCluster as RawCluster, boardSaveState } from "./boardChrome"

const BoardTitleCluster = (p: React.ComponentProps<typeof RawCluster>) => (
  <TooltipProvider>
    <RawCluster {...p} />
  </TooltipProvider>
)

afterEach(cleanup)

// content.md B03: a board has no top bar row. Its controls float on two pop
// clusters at the top corners, toolbars to assistive tech, and step back
// while someone draws without anything re-rendering.
describe("a board's chrome", () => {
  it("is a toolbar cluster with back, the name, a save dot and More", () => {
    render(
      <BoardTitleCluster backHref="/app/board" title="Launch retro" editable onRename={() => {}} saveState="saved" menu={(t) => t} />,
    )
    const bar = screen.getByRole("toolbar", { name: "Board" })
    expect(bar.className).toMatch(/bg-pop/)
    expect(bar.className).toMatch(/shadow-e3/)
    expect(bar.hasAttribute("data-board-chrome")).toBe(true)
    expect(screen.getByRole("link", { name: "All boards" }).getAttribute("href")).toBe("/app/board")
    expect(screen.getByRole("button", { name: /Launch retro, rename/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy()
    // Never the word "Saving".
    expect(bar.textContent).not.toMatch(/Saving/)
  })

  it("says View only for someone who cannot edit, and does not offer a rename", () => {
    render(<BoardTitleCluster backHref="/app/board" title="Launch retro" editable={false} onRename={() => {}} saveState="saved" menu={(t) => t} />)
    expect(screen.getByText("View only")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /rename/ })).toBeNull()
  })

  it("renames in place: Enter saves, Escape puts the name back", () => {
    const onRename = vi.fn()
    render(<BoardName title="Launch retro" editable onRename={onRename} />)
    fireEvent.click(screen.getByRole("button", { name: /rename/ }))
    const input = screen.getByRole("textbox", { name: "Board name" })
    fireEvent.change(input, { target: { value: "Retro, October" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onRename).toHaveBeenCalledWith("Retro, October")

    fireEvent.click(screen.getByRole("button", { name: /rename/ }))
    fireEvent.change(screen.getByRole("textbox", { name: "Board name" }), { target: { value: "Oops" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Board name" }), { key: "Escape" })
    expect(onRename).toHaveBeenCalledTimes(1)
  })

  it("shows the live connection as the save dot: offline, connecting, then saved", () => {
    expect(boardSaveState("offline", false)).toBe("offline")
    expect(boardSaveState("disconnected", true)).toBe("offline")
    expect(boardSaveState("connected", false)).toBe("connecting")
    expect(boardSaveState("synced", true)).toBe("saved")
  })

  it("has no top bar row on the board page, and its clusters don't follow the canvas's scroll", () => {
    const page = readFileSync("app/app/board/[board-id]/page.tsx", "utf8")
    expect(page).not.toMatch(/border-b bg-background px-2 sm:h-14/)
    expect(page).toMatch(/<BoardTitleCluster/)
    expect(page).toMatch(/<ChromeCluster label="Board tools"/)
    // Panning stays cheap: neither the page nor the chrome subscribes to the
    // canvas's scroll or change events.
    const chrome = readFileSync("components/board/boardChrome.tsx", "utf8")
    for (const src of [page, chrome]) {
      expect(src).not.toMatch(/onScrollChange|useBoardView|\.onChange\(/)
    }
  })
})
