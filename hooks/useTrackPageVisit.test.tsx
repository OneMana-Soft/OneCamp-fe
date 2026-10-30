import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { Profiler, type ReactNode } from "react"
import { Provider } from "react-redux"
import { act, cleanup, render } from "@testing-library/react"
import { configureStore } from "@reduxjs/toolkit"
import userSlice, { createUserChannelList } from "@/store/slice/userSlice"
import { recentItemsSlice } from "@/store/slice/recentItemsSlice"
import { taskInfoSlice } from "@/store/slice/taskInfoSlice"
import type { ChannelInfoInterface } from "@/types/channel"

// The command palette, mounted on every screen, tracks page visits. The hook
// subscribed to the task list and the sidebar's four lists for the life of the
// app, so the palette re-rendered on every unread count. It now reads the
// store when the address changes, and listens only until the page's name is
// there.

let path = "/app/channel/c1"
vi.mock("next/navigation", () => ({ usePathname: () => path }))

import { PageVisits, useTrackPageVisit } from "./useTrackPageVisit"

afterEach(cleanup)

function setup() {
  const store = configureStore({
    reducer: {
      [userSlice.name]: userSlice.reducer,
      [recentItemsSlice.name]: recentItemsSlice.reducer,
      [taskInfoSlice.name]: taskInfoSlice.reducer,
    },
    middleware: (d) => d({ serializableCheck: false }),
  })
  let renders = 0
  function Tracker() {
    useTrackPageVisit()
    return null
  }
  const wrap = (children: ReactNode) => (
    <Provider store={store}>
      <Profiler id="tracker" onRender={() => renders++}>
        {children}
      </Profiler>
    </Provider>
  )
  const view = render(wrap(<Tracker />))
  return { store, renders: () => renders, rerender: () => view.rerender(wrap(<Tracker />)) }
}

const channel = (unread: number) =>
  ({ ch_uuid: "c1", ch_name: "engineering", unread_post_count: unread }) as unknown as ChannelInfoInterface

describe("tracking a page visit", () => {
  it("records the page once its name is in the store", () => {
    path = "/app/channel/c1"
    const { store } = setup()
    expect(store.getState().recentItems.items).toHaveLength(0)
    act(() => void store.dispatch(createUserChannelList({ channelsUser: [channel(0)], favChannelsUser: [] })))
    const items = store.getState().recentItems.items
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: "c1", type: "channel", title: "engineering" })
  })

  it("doesn't re-render its host when the sidebar's lists change", () => {
    path = "/app/channel/c1"
    const { store, renders } = setup()
    act(() => void store.dispatch(createUserChannelList({ channelsUser: [channel(0)], favChannelsUser: [] })))
    const before = renders()
    for (let n = 1; n <= 5; n++) act(() => void store.dispatch(createUserChannelList({ channelsUser: [channel(n)], favChannelsUser: [] })))
    expect(renders()).toBe(before)
    expect(store.getState().recentItems.items).toHaveLength(1)
  })
})

// 21 Oct 2026: the palette mounts on its first use now (CommandPaletteLoader),
// and the visits it tracked before that use went unrecorded: Recent in the
// palette, a split view's titles (SplitPane) and the AI's "recent channel"
// knew only the pages after it. The tracking is the shell's, on every page.
describe("where the visits are tracked", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

  it("on every signed-in page, whether or not the palette has opened", () => {
    expect(read("app/app/layout.tsx")).toMatch(/<PageVisits \/>/)
    expect(read("components/ui/CommandPalette.tsx")).not.toMatch(/useTrackPageVisit/)
  })

  it("records a visit with nothing but the tracker drawn", () => {
    path = "/app/channel/c1"
    const store = configureStore({
      reducer: {
        [userSlice.name]: userSlice.reducer,
        [recentItemsSlice.name]: recentItemsSlice.reducer,
        [taskInfoSlice.name]: taskInfoSlice.reducer,
      },
      middleware: (d) => d({ serializableCheck: false }),
    })
    store.dispatch(createUserChannelList({ channelsUser: [channel(0)], favChannelsUser: [] }))
    render(
      <Provider store={store}>
        <PageVisits />
      </Provider>,
    )
    expect(store.getState().recentItems.items[0]).toMatchObject({ id: "c1", type: "channel", title: "engineering" })
  })
})
