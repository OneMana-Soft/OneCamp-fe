// The board on a call's stage (calls package B): the live board, editable as
// the collaboration server allows this person; its presenter's name; and the
// presenter's bar, for exactly who may use it (lib/calls/control's
// boardControls): who draws, guests' drawing, and taking it down.
import { afterEach, describe, expect, it, vi } from "vitest"
import { act as during, cleanup, fireEvent, render, screen } from "@testing-library/react"
import * as Y from "yjs"
import type { BoardControls } from "@/lib/calls/control"

let collab: { provider: { document?: Y.Doc }; synced: boolean; readOnly: boolean; openError: "unavailable" | null } = {
  provider: {},
  synced: true,
  readOnly: false,
  openError: null,
}
vi.mock("@/hooks/useCollaborationProvider", () => ({ useCollaborationProvider: () => collab }))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam", user_name: "Sam Rivera" } } }) }))
vi.mock("@/components/board/boardCanvas", () => ({
  default: ({ editable, boardId, theme }: { editable: boolean; boardId: string; theme?: string }) => (
    <div data-canvas={boardId} data-editable={String(editable)} data-theme={theme}>
      <div className="Island App-toolbar App-toolbar--mobile" data-testid="tool-row" />
    </div>
  ),
}))

const { default: CallBoardStage } = await import("./CallBoardStage")

const BOARD = { uuid: "b1", by: "maya", draw: "everyone" as const, guests: false }
const NOTHING: BoardControls = { present: "busy", stop: false, run: false, mine: false }
const act = vi.fn(() => Promise.resolve(true))
const stage = (o: Partial<Parameters<typeof CallBoardStage>[0]> = {}) => (
  <CallBoardStage board={BOARD} presenter="Maya Chen" controls={NOTHING} guestsInCall={false} act={act} {...o} />
)
const openDrawing = () => fireEvent.keyDown(screen.getByRole("button", { name: "Who can draw" }), { key: "Enter" })

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  collab = { provider: {}, synced: true, readOnly: false, openError: null }
})

describe("the board on a call's stage", () => {
  it("draws the live board for everyone, named for its presenter, editable as the server allows", async () => {
    render(stage())
    expect(await screen.findByText("Maya Chen's board")).toBeTruthy()
    expect(document.querySelector("[data-canvas]")).toHaveAttribute("data-editable", "true")
    cleanup()
    collab = { ...collab, readOnly: true }
    render(stage())
    expect(document.querySelector("[data-canvas]")).toHaveAttribute("data-editable", "false")
  })

  it("draws the board in the stage's dark, whatever the app's theme, and marks it view-only when it is", () => {
    render(stage())
    expect(document.querySelector("[data-canvas]")).toHaveAttribute("data-theme", "dark")
    expect(document.querySelector("[data-call-board]")).not.toHaveAttribute("data-board-view-only")
    cleanup()
    collab = { ...collab, readOnly: true }
    render(stage())
    expect(document.querySelector("[data-call-board]")).toHaveAttribute("data-board-view-only")
  })

  // DESIGN-BUILD-24 on a phone: the canvas's tool row is wider than the frame,
  // so it scrolls, and it fades as every strip does (data-edge-fade).
  it("marks the canvas's phone tool row as a strip that scrolls", () => {
    render(stage())
    expect(screen.getByTestId("tool-row")).toHaveAttribute("data-edge-fade", "")
  })

  it("puts its pills over the board's top corners, or in a row of their own while its tools take that row", () => {
    const size = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    for (const [w, h, bar] of [
      [1040, 710, "overlay"],
      [374, 640, "row"],
      [700, 300, "row"],
    ] as const) {
      size.mockReturnValue({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
      render(stage({ controls: { present: "yes", stop: true, run: true, mine: true } }))
      expect(document.querySelector("[data-board-bar]"), `${w}x${h}`).toHaveAttribute("data-board-bar", bar)
      cleanup()
    }
    size.mockRestore()
  })

  it("says so when the board can't be opened, and draws nothing", () => {
    collab = { ...collab, openError: "unavailable" }
    render(stage())
    expect(screen.getByText("This board can't be opened")).toBeTruthy()
    expect(document.querySelector("[data-canvas]")).toBeNull()
  })

  it("gives someone who may do nothing to it no bar", () => {
    render(stage())
    expect(screen.queryByRole("button", { name: "Who can draw" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Stop presenting|Take the board down/ })).toBeNull()
  })

  it("lets its presenter and the people running the call choose who draws", async () => {
    render(stage({ controls: { present: "yes", stop: true, run: true, mine: false } }))
    openDrawing()
    const everyone = await screen.findByRole("menuitemcheckbox", { name: "Teammates can draw" })
    expect(everyone).toHaveAttribute("aria-checked", "true")
    await during(async () => fireEvent.click(everyone))
    expect(act).toHaveBeenCalledWith("board_draw", { draw: "presenter" })
    cleanup()
    render(stage({ board: { ...BOARD, draw: "presenter" }, controls: { present: "yes", stop: true, run: true, mine: true } }))
    openDrawing()
    await during(async () => fireEvent.click(await screen.findByRole("menuitemcheckbox", { name: "Teammates can draw" })))
    expect(act).toHaveBeenLastCalledWith("board_draw", { draw: "everyone" })
  })

  it("offers guests' drawing, and taking it back, only when the call has guests", async () => {
    render(stage({ controls: { present: "yes", stop: true, run: true, mine: true } }))
    openDrawing()
    await screen.findByRole("menuitemcheckbox", { name: "Teammates can draw" })
    expect(screen.queryByRole("menuitemcheckbox", { name: "Guests can draw" })).toBeNull()
    expect(screen.queryByRole("menuitem", { name: "Undo guests' drawing" })).toBeNull()
    cleanup()
    render(stage({ controls: { present: "yes", stop: true, run: true, mine: true }, guestsInCall: true }))
    openDrawing()
    const guests = await screen.findByRole("menuitemcheckbox", { name: "Guests can draw" })
    expect(guests).toHaveAttribute("aria-checked", "false")
    await during(async () => fireEvent.click(guests))
    expect(act).toHaveBeenCalledWith("board_guests", { on: true })
    // Nobody to take back yet: the undo waits, and says why.
    openDrawing()
    expect(await screen.findByText("No guest has drawn on it yet")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Undo guests' drawing" })).toHaveAttribute("aria-disabled", "true")
    await during(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Undo guests' drawing" })))
    expect(act).not.toHaveBeenCalledWith("undo_guests")
  })

  it("names the guests who drew on it, as guests, most recent first, and keeps their undo after they leave", async () => {
    const doc = new Y.Doc()
    const authors = doc.getMap("guestAuthors")
    authors.set("e1", { id: "guest-p1", name: "Guest: Priya", at: 2 })
    authors.set("e2", { id: "guest-l1", name: "Guest: Lee", at: 3 })
    authors.set("e3", { id: "guest-p1", name: "Guest: Priya", at: 1 })
    collab = { ...collab, provider: { document: doc } }
    render(stage({ controls: { present: "yes", stop: true, run: true, mine: true } }))
    openDrawing()
    expect(await screen.findByText("Lee (guest) and Priya (guest) drew on it")).toBeTruthy()
    await during(async () => fireEvent.click(screen.getByRole("menuitem", { name: "Undo guests' drawing" })))
    expect(act).toHaveBeenCalledWith("undo_guests")
    await during(async () => authors.set("e4", { id: "guest-a1", name: "Guest: Ana", at: 4 }))
    openDrawing()
    expect(await screen.findByText("Ana (guest), Lee (guest) and Priya (guest) drew on it")).toBeTruthy()
  })

  it("lets its presenter stop presenting, and whoever else may take it down", async () => {
    render(stage({ controls: { present: "yes", stop: true, run: true, mine: true } }))
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Stop presenting" })))
    expect(act).toHaveBeenCalledWith("stop_board")
    cleanup()
    // In a DM or a group anyone may take it down, but only its presenter chooses who draws.
    render(stage({ controls: { present: "busy", stop: true, run: false, mine: false } }))
    expect(screen.queryByRole("button", { name: "Who can draw" })).toBeNull()
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Take the board down" })))
    expect(act).toHaveBeenLastCalledWith("stop_board")
  })
})
