import { Activity, type JSX } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { lazyView } from "./LazyView"

afterEach(cleanup)

// A chunk that failed to load once (offline for a moment) left its view
// unopenable until a reload: the failed promise was kept, and every later
// ask got the same failure.
describe("a view loaded as a chunk of its own, after a failed load", () => {
  it("draws a project's tab shown again: Board and Timeline are kept, hidden, between visits", async () => {
    const load = vi.fn<() => Promise<{ Board: () => JSX.Element }>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ Board: () => <p>The board</p> })
    const Board = lazyView(load)
    const tab = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <Board.View fallback={<p>Loading the board</p>} render={(m) => <m.Board />} />
      </Activity>
    )
    const { rerender } = render(tab("visible"))
    await act(async () => {})
    expect(screen.getByText("Loading the board")).toBeTruthy()
    rerender(tab("hidden"))
    rerender(tab("visible"))
    await act(async () => {})
    expect(screen.getByText("The board")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("draws a view that waited, when its chunk lands, whoever asked for it", async () => {
    const load = vi.fn<() => Promise<{ Panel: () => JSX.Element }>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ Panel: () => <p>The dialog</p> })
    const Dialog = lazyView(load)
    render(<Dialog.View fallback={null} render={(m) => <m.Panel />} />)
    await act(async () => {})
    expect(screen.queryByText("The dialog")).toBeNull()
    // Nothing draws the view again: the opener asks for the chunk once more.
    await act(async () => {
      await Dialog.warm()
    })
    expect(screen.getByText("The dialog")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("draws a calendar surface whose fetch ahead failed, when it opens", async () => {
    const load = vi.fn<() => Promise<{ Panel: () => JSX.Element }>>().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ Panel: () => <p>Your calendars</p> })
    const Calendars = lazyView(load)
    // Fetched at the page's first quiet moment, as the calendar does, and failed.
    await expect(Calendars.warm()).rejects.toThrow("offline")
    render(<Calendars.View fallback={<p>Loading your calendars</p>} render={(m) => <m.Panel />} />)
    await act(async () => {})
    expect(screen.getByText("Your calendars")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(2)
  })
})
