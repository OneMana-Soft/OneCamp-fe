import * as React from "react"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import splitSlice from "@/store/slice/splitSlice"
import { useListKeyboard } from "@/hooks/useListKeyboard"
import { createSelectionStore } from "@/lib/listSelection"

// The keys' place is painted, not rendered (FLUIDITY-24, 9 Nov 2026): it
// follows the task, not the node. Whatever draws the task carries
// data-highlighted="true", and nothing else does, as rows leave and come back
// (a window), change group (a new node), are sorted again (the same node,
// moved), are filtered away or soft-deleted (the list lets go of what it no
// longer shows: KeyboardList's keepOnly), and as Escape lets go of it.
afterEach(cleanup)

type Groups = Record<string, string[]>
function renderList(initial: Groups) {
  const app = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer, split: splitSlice.reducer } })
  const selection = createSelectionStore()
  /** `out`: the list's tasks a window doesn't draw now. */
  function List({ groups, out = [] }: { groups: Groups; out?: string[] }) {
    const box = React.useRef<HTMLDivElement>(null)
    useListKeyboard({ containerRef: box, store: selection, enabled: true })
    React.useEffect(() => selection.keepOnly(new Set(Object.values(groups).flat())), [groups])
    return (
      <div data-split-view="-1">
        <div ref={box}>
          {Object.entries(groups).map(([g, ids]) => (
            <section key={g} data-group={g}>
              {ids.filter((id) => !out.includes(id)).map((id) => (
                <div key={id} data-task-id={id} tabIndex={-1}>
                  {id}
                </div>
              ))}
            </section>
          ))}
          {/* A menu's item: its own data-highlighted, never the keys'. */}
          <div role="menuitem" data-highlighted="" />
        </div>
      </div>
    )
  }
  const view = render(
    <Provider store={app}>
      <List groups={initial} />
    </Provider>,
  )
  const show = (groups: Groups, out?: string[]) =>
    act(() =>
      view.rerender(
        <Provider store={app}>
          <List groups={groups} out={out} />
        </Provider>,
      ),
    )
  /** The tasks lit, one per node that draws them. */
  const lit = () => Array.from(view.container.querySelectorAll("[data-task-id][data-highlighted]"), (el) => `${el.getAttribute("data-task-id")}=${el.getAttribute("data-highlighted")}`)
  const store = () => (selection.get().highlighted ? [`${selection.get().highlighted}=true`] : [])
  return { ...view, selection, show, lit, store }
}
const j = () => fireEvent.keyDown(document.body, { key: "j" })

describe("the keys' place, painted on the task", () => {
  it("lights one row as J moves, and the menu's item keeps its own", () => {
    const { container, lit, store } = renderList({ a: ["t1", "t2", "t3"] })
    j()
    j()
    expect(lit()).toEqual(["t2=true"])
    expect(lit()).toEqual(store())
    expect(container.querySelector("[role=menuitem]")?.getAttribute("data-highlighted")).toBe("")
  })

  it("lights the row again as it leaves the window and comes back", async () => {
    const { lit, store, show } = renderList({ a: ["t1", "t2", "t3"] })
    j()
    j()
    show({ a: ["t1", "t2", "t3"] }, ["t2"])
    // Out of the window but still the list's: the store keeps it; nothing drawn is lit.
    expect(store()).toEqual(["t2=true"])
    expect(lit()).toEqual([])
    show({ a: ["t1", "t2", "t3"] })
    await act(async () => {})
    expect(lit()).toEqual(["t2=true"])
    expect(lit()).toEqual(store())
  })

  it("follows its task into another group (a new node) and through a new sort (the same node, moved)", async () => {
    const { lit, store, show } = renderList({ a: ["t1", "t2", "t3"], b: ["t4"] })
    j()
    j()
    show({ a: ["t1", "t3"], b: ["t2", "t4"] })
    await act(async () => {})
    expect(lit()).toEqual(["t2=true"])
    show({ a: ["t3", "t1"], b: ["t4", "t2"] })
    await act(async () => {})
    expect(lit()).toEqual(["t2=true"])
    expect(lit()).toEqual(store())
  })

  it("lights nothing once a filter hides its task or it is deleted, and nothing after Escape", async () => {
    const { lit, store, show, selection } = renderList({ a: ["t1", "t2", "t3"] })
    j()
    j()
    show({ a: ["t1", "t3"] })
    await act(async () => {})
    expect(selection.get().highlighted).toBeNull()
    expect(lit()).toEqual([])
    j()
    expect(lit()).toEqual(store())
    expect(lit()).toHaveLength(1)
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(selection.get().highlighted).toBeNull()
    expect(lit()).toEqual([])
  })
})
