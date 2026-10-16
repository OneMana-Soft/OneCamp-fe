import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"
import { FaviconBadge } from "./FaviconBadge"

// SD-62: a pinned tab said nothing. Its icon gets a dot while something
// needs you (a DM's unread, a channel's mention of you, the Inbox) and loses
// it when nothing does; plain chatter in a channel leaves it alone.

type Sidebar = { userChats: unknown[]; userChannels: unknown[]; totalUnreadActivityCount: number }
const quiet: Sidebar = { userChats: [], userChannels: [], totalUnreadActivityCount: 0 }

function app(sidebar: Sidebar) {
  const store = configureStore({
    reducer: { users: (s: { userSidebar: Sidebar } = { userSidebar: sidebar }, a: { type: string; payload?: Sidebar }) => (a.type === "sidebar" ? { userSidebar: a.payload! } : s) },
  })
  render(
    <Provider store={store}>
      <FaviconBadge />
    </Provider>,
  )
  return (next: Sidebar) => act(() => void store.dispatch({ type: "sidebar", payload: next }))
}

const dots = () => document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"][data-favicon-dot]')

afterEach(cleanup)

describe("the tab's icon", () => {
  it("gets a dot for a DM's unread, and loses it once read", () => {
    const set = app({ ...quiet, userChats: [{ dm_grouping_id: "g", dm_unread: 2 }] })
    expect(dots()).toHaveLength(1)
    expect(dots()[0].getAttribute("href")).toBe("/favicon-dot.svg")
    expect(dots()[0].type).toBe("image/svg+xml")
    set({ ...quiet, userChats: [{ dm_grouping_id: "g", dm_unread: 0 }] })
    expect(dots()).toHaveLength(0)
  })

  it("gets a dot for a mention of you, in a muted channel too, and for the Inbox", () => {
    const set = app({ ...quiet, userChannels: [{ ch_uuid: "c", unread_post_count: 4, unread_mention_count: 1, notification_type: "block" }] })
    expect(dots()).toHaveLength(1)
    set({ ...quiet, totalUnreadActivityCount: 3 })
    expect(dots()).toHaveLength(1)
  })

  it("stays plain for chatter in a channel, and never doubles its dot", () => {
    const set = app({ ...quiet, userChannels: [{ ch_uuid: "c", unread_post_count: 9 }] })
    expect(dots()).toHaveLength(0)
    set({ ...quiet, totalUnreadActivityCount: 1 })
    set({ ...quiet, totalUnreadActivityCount: 2, userChats: [{ dm_grouping_id: "g", dm_unread: 1 }] })
    expect(dots()).toHaveLength(1)
  })

  it("draws the dot on the page's own ring", () => {
    const pub = (f: string) => readFileSync(join(process.cwd(), "public", f), "utf8")
    const ring = pub("logo.svg").match(/<circle[^>]*\/>/)![0]
    expect(pub("favicon-dot.svg")).toContain(ring)
  })
})
