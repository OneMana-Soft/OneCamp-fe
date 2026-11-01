import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as React from "react"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"
import { lazyPanel } from "@/lib/lazy/lazyPanel"
import { BoardSideFrame, BoardSidePanel, SIDE_PANELS, SidePanelShape } from "./boardSidePanel"

// V-195 (DB-71's MUST): a board's side panel is a chunk of its own, and while that chunk came the board showed
// nothing: a phone that lost it saw the menu close and no sheet for 30 s, with no way to try again. Now the workbench
// draws the panel's frame at once (its name, Close live), the panel's shape inside it, at 10 s the slow line with Try
// again (lib/lazy/lazyPanel), and the panel, once in, fills that same frame, so a phone's sheet rises once.

let off = () => {}
afterEach(() => {
  cleanup()
  off()
  off = () => {}
  vi.useRealTimers()
})

type Props = { editable: boolean; onClose: () => void }

/** A panel as Find is: its words, its field, a footer holding a field of its own, and a count it changes. */
function Find({ editable, onClose }: Props) {
  const [replacement, setReplacement] = React.useState("")
  const [rows, setRows] = React.useState(2)
  const footer = editable
    ? () => <input aria-label="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
    : undefined
  return (
    <BoardSidePanel {...SIDE_PANELS.find(editable)} count={rows} footer={footer} onClose={onClose}>
      <input aria-label="Find on board" />
      <button type="button" onClick={() => setRows((n) => n + 1)}>
        One more
      </button>
    </BoardSidePanel>
  )
}

/** The panel's code on a line the test holds: each fetch waits until open() or fail(). */
function held() {
  const calls: Array<{ open: () => void; fail: (e: unknown) => void }> = []
  const load = vi.fn(
    () =>
      new Promise<React.ComponentType<Props>>((resolve, reject) => {
        calls.push({ open: () => resolve(Find), fail: reject })
      }),
  )
  return { load, calls }
}

function framed(load: () => Promise<React.ComponentType<Props>>, onClose = vi.fn()) {
  const Panel = lazyPanel(load, "this panel", SidePanelShape)
  render(
    <BoardSideFrame {...SIDE_PANELS.find(true)} onClose={onClose}>
      <Panel editable onClose={onClose} />
    </BoardSideFrame>,
  )
  return onClose
}

const settle = () => act(async () => {})

describe("the frame a board's side panel comes into", () => {
  it("rises at once on a computer, named for its panel with Close live, the panel's shape inside while its code comes", () => {
    const code = held()
    const onClose = framed(code.load)
    const frame = screen.getByRole("complementary", { name: "Find and replace" })
    expect(frame.hasAttribute("data-board-find")).toBe(true)
    expect(within(frame).getByRole("status", { name: "Loading" })).toBeTruthy()
    expect(frame.querySelector("[data-board-panel-footer]")).toBeNull()
    fireEvent.click(within(frame).getByRole("button", { name: "Close find" }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("is filled by the panel once its code lands, the same element: its body in place, its footer in the frame's foot, its count in the header", async () => {
    const code = held()
    framed(code.load)
    const frame = screen.getByRole("complementary", { name: "Find and replace" })
    code.calls[0].open()
    await settle()
    // The frame never went away, so nothing rises a second time.
    expect(screen.getByRole("complementary", { name: "Find and replace" })).toBe(frame)
    expect(within(frame).queryByRole("status", { name: "Loading" })).toBeNull()
    const scroller = within(frame).getByRole("textbox", { name: "Find on board" }).parentElement!
    expect(scroller.className).toContain("overflow-y-auto")
    // The footer is the scroller's sibling, as a panel's own is, and its field is the panel's: typed words and the
    // focus stay.
    const foot = frame.querySelector<HTMLElement>("[data-board-panel-footer]")!
    expect(foot.parentElement).toBe(frame)
    expect(scroller.contains(foot)).toBe(false)
    const replace = within(foot).getByRole<HTMLInputElement>("textbox", { name: "Replace with" })
    replace.focus()
    fireEvent.change(replace, { target: { value: "launch" } })
    expect(within(foot).getByRole<HTMLInputElement>("textbox", { name: "Replace with" })).toBe(replace)
    expect(replace.value).toBe("launch")
    expect(document.activeElement).toBe(replace)
    expect(frame.querySelector("header")?.textContent).toBe("Find and replace2")
    fireEvent.click(within(frame).getByRole("button", { name: "One more" }))
    expect(frame.querySelector("header")?.textContent).toBe("Find and replace3")
  })

  it("is the sheet the panel fills on a phone: one dialog, named, its footer in the sheet's pinned foot", async () => {
    off = putOnScreen(SCREENS["a phone in portrait"])
    const code = held()
    framed(code.load)
    const sheet = screen.getByRole("dialog", { name: "Find and replace" })
    expect(sheet.hasAttribute("data-board-find")).toBe(true)
    expect(sheet.hasAttribute("data-v3-sheet")).toBe(true)
    expect(sheet.getAttribute("data-detent")).toBe("half")
    expect(within(sheet).getByRole("status", { name: "Loading" })).toBeTruthy()
    expect(sheet.querySelector("[data-sheet-footer]")).toBeNull()
    code.calls[0].open()
    await settle()
    expect(screen.getByRole("dialog", { name: "Find and replace" })).toBe(sheet)
    const body = sheet.querySelector<HTMLElement>("[data-sheet-body]")!
    expect(within(body).getByRole("textbox", { name: "Find on board" })).toBeTruthy()
    const foot = sheet.querySelector<HTMLElement>("[data-sheet-footer]")!
    expect(within(foot).getByRole("textbox", { name: "Replace with" })).toBeTruthy()
    expect(body.contains(foot)).toBe(false)
  })

  it("says at 10 s that the panel is slow, in the frame with Close, and the panel still fills it when its code lands", async () => {
    vi.useFakeTimers()
    const code = held()
    framed(code.load)
    const frame = screen.getByRole("complementary", { name: "Find and replace" })
    act(() => vi.advanceTimersByTime(9_999))
    expect(within(frame).queryByRole("alert")).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(within(frame).getByRole("alert").textContent).toContain("taking longer than it should")
    expect(within(frame).getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(within(frame).getByRole("button", { name: "Close find" })).toBeTruthy()
    code.calls[0].open()
    await settle()
    expect(within(frame).queryByRole("alert")).toBeNull()
    expect(within(frame).getByRole("textbox", { name: "Find on board" })).toBeTruthy()
    expect(screen.getByRole("complementary", { name: "Find and replace" })).toBe(frame)
  })

  it("says in the frame that the panel couldn't come, and Try again fetches its code once more", async () => {
    const code = held()
    framed(code.load)
    const frame = screen.getByRole("complementary", { name: "Find and replace" })
    code.calls[0].fail(new Error("offline"))
    await settle()
    expect(within(frame).getByRole("alert").textContent).toContain("Couldn't load this panel")
    fireEvent.click(within(frame).getByRole("button", { name: "Try again" }))
    await settle()
    expect(code.load).toHaveBeenCalledTimes(2)
    expect(within(frame).getByRole("status", { name: "Loading" })).toBeTruthy()
    code.calls[1].open()
    await settle()
    expect(within(frame).getByRole("textbox", { name: "Find on board" })).toBeTruthy()
  })
})
