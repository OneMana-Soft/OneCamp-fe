import { readFileSync } from "node:fs"
import { join } from "node:path"
import { useEffect } from "react"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { afterEach, describe, expect, it, vi } from "vitest"
import splitSlice from "@/store/slice/splitSlice"
import { closeSplit, moveView, openInSplit, setFocused } from "@/store/slice/splitActions"
import { MAIN } from "@/lib/split"
import type { Pane } from "@/lib/split"

// The full-page call's Chat lit up and opened nothing: it puts the call's
// conversation beside the call in split view, and a call's own page drew the
// call alone (LayoutContent's meeting branch returned its children). Its page
// now draws that conversation beside it, and only that one, without moving
// the call: a call that remounts hangs up.

// The pane itself is the shell's (its views load the whole conversation); its
// bar, name and body are tested where they live, and the arrange layer too.
vi.mock("@/components/split/lazy", () => ({
  SplitPane: ({ pane, index, active, focused }: { pane: Pane; index: number; active: boolean; focused: boolean }) => (
    <section aria-label={`${pane.kind} ${pane.id}, side by side`} data-index={index} data-active={String(active)} data-focused={String(focused)} />
  ),
  SplitArrange: () => null,
}))

import { MeetingSplit } from "./MeetingSplit"

const CH = "c0ffee00-0000-4000-8000-0000000000c1"
const counts = { mounts: 0, unmounts: 0 }

function Call() {
  useEffect(() => {
    counts.mounts++
    return () => {
      counts.unmounts++
    }
  }, [])
  return <div data-testid="call">the call</div>
}

function setup(pathname: string, opts: { panes?: Pane[]; enabled?: boolean } = {}) {
  const store = configureStore({ reducer: { split: splitSlice.reducer } })
  for (const p of opts.panes ?? []) store.dispatch(openInSplit(p))
  const view = render(
    <Provider store={store}>
      <MeetingSplit pathname={pathname} enabled={opts.enabled ?? true}>
        <Call />
      </MeetingSplit>
    </Provider>,
  )
  return { store, ...view }
}

const beside = () => screen.queryAllByRole("region", { name: /side by side/ })

afterEach(() => {
  cleanup()
  counts.mounts = 0
  counts.unmounts = 0
})

describe("a call's own page", () => {
  it("draws the call alone until its Chat opens the conversation", () => {
    setup(`/app/meet/ch/${CH}`)
    expect(screen.getByTestId("call")).toBeTruthy()
    expect(beside()).toEqual([])
  })

  it("draws the call's conversation beside it when Chat opens it, and closes it again, without remounting the call", () => {
    const { store } = setup(`/app/meet/ch/${CH}`)
    act(() => {
      store.dispatch(openInSplit({ kind: "channel", id: CH }))
    })
    const pane = screen.getByRole("region", { name: `channel ${CH}, side by side` })
    expect(pane.dataset.index).toBe("0")
    // Opening Chat makes the conversation the view the keys act on.
    expect(pane.dataset.active).toBe("true")
    act(() => {
      store.dispatch(closeSplit(0))
    })
    expect(beside()).toEqual([])
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  it("draws a DM's and a group's conversation beside their calls", () => {
    setup(`/app/meet/chat/${CH}`, { panes: [{ kind: "chat", id: CH }] })
    expect(screen.getByRole("region", { name: `chat ${CH}, side by side` })).toBeTruthy()
  })

  it("leaves out what was opened beside other pages, and names the conversation by its own place among the panes", () => {
    const doc = { kind: "doc" as const, id: "dddddd" }
    setup(`/app/meet/grp/${CH}`, { panes: [doc, { kind: "group", id: CH }] })
    expect(beside()).toHaveLength(1)
    expect(screen.getByRole("region", { name: `group ${CH}, side by side` }).dataset.index).toBe("1")
  })

  it("hides the call, still running, while the conversation is focused alone", () => {
    const { store, container } = setup(`/app/meet/ch/${CH}`, { panes: [{ kind: "channel", id: CH }] })
    act(() => {
      store.dispatch(setFocused(0))
    })
    const call = container.querySelector("[data-meeting-call]") as HTMLElement
    expect(call.className).toMatch(/\bhidden\b/)
    expect(screen.getByRole("region", { name: `channel ${CH}, side by side` }).dataset.focused).toBe("true")
    act(() => {
      store.dispatch(setFocused(null))
    })
    expect(call.className).not.toMatch(/\bhidden\b/)
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  // Split view's rearranging: the conversation can sit on the call's other
  // side, by CSS order alone, so the call never moves in the page.
  it("puts the conversation on the call's left once it is moved there, without remounting the call", () => {
    const { store, container } = setup(`/app/meet/ch/${CH}`, { panes: [{ kind: "channel", id: CH }] })
    const call = container.querySelector("[data-meeting-call]") as HTMLElement
    expect(call.style.order).toBe("1")
    act(() => {
      store.dispatch(moveView({ view: MAIN, by: 1 }))
    })
    expect(call.style.order).toBe("3")
    expect((screen.getByRole("region", { name: `channel ${CH}, side by side` }).parentElement as HTMLElement).style.order).toBe("1")
    expect(container.querySelector("[data-meeting-call]")).toBe(call)
    expect(counts).toEqual({ mounts: 1, unmounts: 0 })
  })

  it("draws nothing beside a meeting, which has no conversation", () => {
    setup(`/app/meet/m/${CH}`, { panes: [{ kind: "channel", id: CH }] })
    expect(beside()).toEqual([])
  })

  it("draws nothing beside the call where split view is off (a tablet)", () => {
    setup(`/app/meet/ch/${CH}`, { panes: [{ kind: "channel", id: CH }], enabled: false })
    expect(beside()).toEqual([])
    expect(screen.getByTestId("call")).toBeTruthy()
  })
})

describe("the shell's meeting branch", () => {
  const root = join(__dirname, "..", "..")
  const read = (f: string) => readFileSync(join(root, f), "utf8")

  it("draws a call's own page through MeetingSplit, so its Chat opens something", () => {
    expect(read("app/app/LayoutContent.tsx")).toMatch(/if\s*\(inMeeting\)\s*\{\s*return\s*\(?\s*<MeetingSplit\b/)
  })

  it("offers to swap a view only where swapping can happen", () => {
    expect(read("components/split/SplitPane.tsx")).toMatch(/canSwapBeside\(pane, pathname\)/)
    // The swap action's guard is the same rule (kept inline there, off every page's first load).
    expect(read("hooks/useSplitView.ts")).toMatch(/isCallPane\(pane\) \|\| \(here && isCallPane\(here\)\)/)
    expect(read("lib/callConversation.ts")).toMatch(/!isCallPane\(pane\) && !\(here && isCallPane\(here\)\)/)
  })
})
