import { Activity, type JSX } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { lazyView } from "./lazyView"

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

describe("a module loaded as a chunk of its own", () => {
  it("is none until it lands; then whoever reads it draws with it, and a later reader has it at once", async () => {
    const load = vi.fn(async () => ({ word: "ruled" }))
    const Rules = lazyView(load)
    const Reader = ({ id }: { id: string }) => <p>{`${id}: ${Rules.useLoaded()?.word ?? "waiting"}`}</p>
    render(<Reader id="first" />)
    expect(screen.getByText("first: waiting")).toBeTruthy()
    await act(async () => {})
    expect(screen.getByText("first: ruled")).toBeTruthy()
    render(<Reader id="later" />)
    expect(screen.getByText("later: ruled")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("is never asked for by a reader that only waits; that reader draws with it once someone asks", async () => {
    const load = vi.fn(async () => ({ word: "picked" }))
    const Panels = lazyView(load)
    const Shut = () => <p>{Panels.useLoaded(false)?.word ?? "shut"}</p>
    render(<Shut />)
    await act(async () => {})
    expect(load).not.toHaveBeenCalled()
    expect(screen.getByText("shut")).toBeTruthy()
    await act(async () => {
      await Panels.warm()
    })
    expect(screen.getByText("picked")).toBeTruthy()
    expect(load).toHaveBeenCalledTimes(1)
  })
})

describe("a view whose chunk the server says is gone (a deploy since the page loaded)", () => {
  afterEach(() => {
    delete window.__ocChunk
  })

  it("reloads the page once through the one probe: warm() never settles, and the view keeps its fallback", async () => {
    const reloadIfGone = vi.fn(async () => true)
    window.__ocChunk = { reloadIfGone, urlOf: () => "/_next/static/chunks/gone.js", held: [] }
    const view = lazyView(() => Promise.reject(new Error("Loading chunk 9 failed. (missing: /_next/static/chunks/gone.js)")))
    let settled = false
    void view.warm().then(
      () => (settled = true),
      () => (settled = true),
    )
    render(<view.View fallback={<p>Waiting</p>} render={() => <p>Drawn</p>} />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(reloadIfGone).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)
    expect(screen.getByText("Waiting")).toBeTruthy()
  })
})
