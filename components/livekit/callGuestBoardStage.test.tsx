// The board on a call's stage, for a guest (calls package B): opened with the
// guest's own call token, never a member's session; drawn on only while its
// presenter lets everyone draw and "Guests can draw" is on (the collaboration
// server has the last word); named for its presenter.
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const viewer: Record<string, unknown>[] = []
vi.mock("@/components/guest/GuestBoardViewer", () => ({
  // The canvas draws its own phone tool row, as Excalidraw does.
  GuestBoardViewer: (p: Record<string, unknown>) => (
    viewer.push(p),
    (
      <div data-guest-canvas={String(p.boardId)}>
        <div className="Island App-toolbar App-toolbar--mobile" data-testid="tool-row" />
      </div>
    )
  ),
}))
const publicCall = vi.fn()
vi.mock("@/services/publicApi", () => ({ publicCall: (...a: unknown[]) => publicCall(...a) }))

const { default: CallGuestBoardStage } = await import("./CallGuestBoardStage")

const BOARD = { uuid: "b1", by: "maya", draw: "everyone" as const, guests: true }
const stage = (board: typeof BOARD | { uuid: string; by: string; draw: "everyone" | "presenter"; guests: boolean } = BOARD) => (
  <CallGuestBoardStage board={board} presenter="Maya Chen" callToken="lk-token" me={{ identity: "guest-p1", name: "Guest: Priya" }} />
)

afterEach(() => {
  cleanup()
  viewer.length = 0
  vi.clearAllMocks()
})

describe("the board on a call's stage, for a guest", () => {
  it("opens it with the guest's own call token, its pictures with the board's token, and names the guest as one", async () => {
    publicCall.mockResolvedValue({ ok: true, data: { collab_token: "collab-1", document_name: "board:b1", board: "b1" } })
    render(stage())
    expect(screen.getByText("Maya Chen's board")).toBeTruthy()
    const p = viewer.at(-1)!
    expect(p).toMatchObject({ documentName: "board:b1", boardId: "b1", user: { id: "guest-p1", name: "Priya (guest)" } })
    await expect((p.tokenFetcher as () => Promise<string>)()).resolves.toBe("collab-1")
    expect(publicCall).toHaveBeenCalledWith("/guest/calls/board-token", expect.objectContaining({ method: "POST", headers: { Authorization: "Bearer lk-token" } }))
    await vi.waitFor(() => expect(viewer.at(-1)?.token).toBe("collab-1"))
  })

  it("gives the canvas no token the server refused, in the server's words", async () => {
    publicCall.mockResolvedValue({ ok: false, status: 409, msg: "There's no board on the stage.", code: "no_board" })
    render(stage())
    await expect((viewer.at(-1)!.tokenFetcher as () => Promise<string>)()).rejects.toThrow("There's no board on the stage.")
  })

  it("lets the guest draw only while everyone draws and guests may, and says so", () => {
    for (const [board, can] of [
      [BOARD, true],
      [{ ...BOARD, guests: false }, false],
      [{ ...BOARD, draw: "presenter" as const }, false],
    ] as const) {
      render(stage(board))
      expect(viewer.at(-1)?.canDraw).toBe(can)
      expect(!!screen.queryByText("You can draw")).toBe(can)
      // No toolbar while the guest can't draw (the canvas's empty bar on a phone).
      expect(document.querySelector("[data-call-board]")?.hasAttribute("data-board-view-only")).toBe(!can)
      cleanup()
    }
  })

  it("draws the board in the stage's dark, with the pills in a row of their own while its tools take the top row", () => {
    const size = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
    for (const [w, h, bar] of [
      [1040, 710, "overlay"],
      [374, 640, "row"],
    ] as const) {
      size.mockReturnValue({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
      render(stage())
      expect(viewer.at(-1)?.theme).toBe("dark")
      expect(document.querySelector("[data-board-bar]"), `${w}x${h}`).toHaveAttribute("data-board-bar", bar)
      cleanup()
    }
    size.mockRestore()
  })

  // DESIGN-BUILD-24 on a phone, CR-68's MF2: a drawing guest's tool row scrolls
  // inside the frame and fades as every strip does, as the member's does.
  it("marks the canvas's phone tool row as a strip that scrolls, as the member's stage does", () => {
    publicCall.mockResolvedValue({ ok: true, data: { collab_token: "collab-1", document_name: "board:b1", board: "b1" } })
    render(stage())
    expect(screen.getByTestId("tool-row").hasAttribute("data-edge-fade")).toBe(true)
  })
})
