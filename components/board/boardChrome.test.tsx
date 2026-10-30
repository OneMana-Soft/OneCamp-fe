import { readFileSync } from "node:fs"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }))

import { TooltipProvider } from "@/components/ui/tooltip"
import { BoardName, BoardTitleCluster as RawCluster, boardSaveState, useDrawingFade } from "./boardChrome"

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
    // Never the word "Saving"; the dot's words speak of the board, never a doc.
    expect(bar.textContent).not.toMatch(/Saving/)
    expect(bar.textContent).toContain("Saved to the live board")
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

  it("shows the live connection as the save dot, as a doc's does: offline, connecting, reconnecting, saved", () => {
    expect(boardSaveState("offline", false)).toBe("offline")
    expect(boardSaveState("offline", true)).toBe("offline")
    expect(boardSaveState("connecting", false)).toBe("connecting")
    expect(boardSaveState("connected", false)).toBe("connecting")
    // A socket that drops before the first sync is still connecting; after it, reconnecting (V-21), never "offline"
    // on a device that is online.
    expect(boardSaveState("disconnected", false)).toBe("connecting")
    expect(boardSaveState("disconnected", true)).toBe("reconnecting")
    expect(boardSaveState("connecting", true)).toBe("saved")
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

// While a note moves by hand the bar beside the selection steps aside (miro-06, DB-43). The board's one drag
// signal marks it: the pointer listener that dims the chrome marks the board moving too, once a press on the canvas
// has travelled Excalidraw's own drag threshold (10 px), so a click never sends the bar away.
describe("the board's drag signal", () => {
  /** Excalidraw's state as its API reads it (getAppState); `set` changes it, as Excalidraw's own handling of a move does. */
  function scene() {
    let state: unknown = {}
    return {
      api: { getAppState: () => state },
      set: (appState: unknown) => {
        state = appState
      },
    }
  }

  function Board({ api = null }: { api?: ReturnType<typeof scene>["api"] | null }) {
    const [el, setEl] = React.useState<HTMLElement | null>(null)
    useDrawingFade(el, api)
    return (
      <div ref={setEl} data-testid="board">
        <canvas data-testid="canvas" />
        {/* Excalidraw's label for a frame's name: a press there is one on the canvas to Excalidraw. */}
        <div data-testid="frame-name">Sprint</div>
      </div>
    )
  }

  // jsdom has no PointerEvent (testing-library's would lose clientX): a pointer's event as a MouseEvent of its type.
  const pointer = (target: Element | Window, type: string, clientX = 0, clientY = 0) => fireEvent(target, new MouseEvent(type, { bubbles: true, clientX, clientY }))

  it("dims the chrome on a press, and marks the board moving only past the drag threshold, until the release", () => {
    render(<Board />)
    const board = screen.getByTestId("board")
    pointer(screen.getByTestId("canvas"), "pointerdown", 100, 100)
    expect(board.dataset.boardDrawing).toBe("true")
    pointer(window, "pointermove", 106, 106)
    expect(board.dataset.boardMoving).toBeUndefined()
    pointer(window, "pointermove", 108, 107)
    expect(board.dataset.boardMoving).toBe("true")
    pointer(window, "pointerup")
    expect(board.dataset.boardDrawing).toBeUndefined()
    expect(board.dataset.boardMoving).toBeUndefined()
    // A move with no press marks nothing; a press off the canvas neither dims nor moves.
    pointer(window, "pointermove", 300, 300)
    expect(board.dataset.boardMoving).toBeUndefined()
    pointer(board, "pointerdown")
    pointer(window, "pointermove", 50, 50)
    expect(board.dataset.boardDrawing).toBeUndefined()
    expect(board.dataset.boardMoving).toBeUndefined()
  })

  // A frame moves by its name almost always (DB-44), and the press lands on the name's label, not the canvas. The
  // move itself says so: Excalidraw's own marks of a move by hand (movingByHand), past the same threshold, so a
  // frame dragged by its name dims the chrome and sends its bar aside as one dragged by its body does.
  it("marks a move by hand that began off the canvas, by Excalidraw's own marks, past the threshold, until the release", () => {
    const { api, set } = scene()
    render(<Board api={api} />)
    const board = screen.getByTestId("board")
    const name = screen.getByTestId("frame-name")
    pointer(name, "pointerdown", 100, 100)
    expect(board.dataset.boardDrawing).toBeUndefined()
    // Excalidraw marks a drag on the first movement (its threshold is for arrows only): under 10 px it's still a click.
    set({ selectedElementsAreBeingDragged: true })
    pointer(window, "pointermove", 104, 104)
    expect(board.dataset.boardMoving).toBeUndefined()
    pointer(window, "pointermove", 110, 107)
    expect(board.dataset.boardMoving).toBe("true")
    expect(board.dataset.boardDrawing).toBe("true")
    pointer(window, "pointerup")
    set({ selectedElementsAreBeingDragged: false })
    expect(board.dataset.boardMoving).toBeUndefined()
    expect(board.dataset.boardDrawing).toBeUndefined()

    // Past the threshold before Excalidraw's own move handling (paced by frames) marks the drag: a move at the next.
    pointer(name, "pointerdown", 100, 100)
    pointer(window, "pointermove", 130, 100)
    expect(board.dataset.boardMoving).toBeUndefined()
    set({ selectedElementsAreBeingDragged: true })
    pointer(window, "pointermove", 134, 101)
    expect(board.dataset.boardMoving).toBe("true")
    pointer(window, "pointerup")
    set({ selectedElementsAreBeingDragged: false })
    expect(board.dataset.boardMoving).toBeUndefined()

    // A press off the canvas that Excalidraw doesn't move (the name pressed twice, to rename it) marks nothing.
    pointer(name, "pointerdown", 100, 100)
    set({ editingFrame: "sprint" })
    pointer(window, "pointermove", 160, 160)
    pointer(window, "pointermove", 200, 190)
    expect(board.dataset.boardMoving).toBeUndefined()
    expect(board.dataset.boardDrawing).toBeUndefined()
    pointer(window, "pointerup")
    // Nor does a movement with no press, whatever Excalidraw's state says.
    set({ selectedElementsAreBeingDragged: true })
    pointer(window, "pointermove", 300, 300)
    expect(board.dataset.boardMoving).toBeUndefined()
  })
})
