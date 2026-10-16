import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { appMutate } from "@/lib/swrMutate"
import { docDeleted, docRenamed } from "@/lib/docCache"
import type { DocListItem } from "@/types/docGraph"

// The docs home's lists (docs frontend analysis, data flow; N31): a rename or
// a delete didn't reach the list, and a page fetched again was appended a
// second time. Real SWR, the backend stubbed (memory: onecamp-swr-seeding);
// pages are read by cursor, as A3's /doc/list answers them.

const doc = (i: number, title = `Doc ${i}`): DocListItem => ({ doc_uuid: `d${i}`, doc_title: title, path: [] })
const server: Record<string, { docs: DocListItem[]; next?: string }> = {
  "": { docs: Array.from({ length: 30 }, (_, i) => doc(i)), next: "c30" },
  c30: { docs: [doc(30), doc(31)] },
}
const get = vi.fn(async (url: string) => {
  const cursor = new URL(url, "http://x").searchParams.get("cursor") ?? ""
  const page = server[cursor] ?? { docs: [] }
  return { data: { data: { scope: "workspace", docs: page.docs, count: 32, next_cursor: page.next ?? "" } } }
})
vi.mock("@/lib/axiosInstance", () => ({ default: { get: (url: string) => get(url) }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/components/doc/docListResult", () => ({
  DocListResult: ({ items, onLoadMore, hasMore }: { items: DocListItem[]; onLoadMore: () => void; hasMore: boolean }) => (
    <div>
      <ul>
        {items.map((d) => (
          <li key={d.doc_uuid}>{d.doc_title}</li>
        ))}
      </ul>
      {hasMore && <button onClick={onLoadMore}>More</button>}
    </div>
  ),
}))

import { DocListTab } from "./DocListTab"

afterEach(cleanup)

function renderTab() {
  const store = configureStore({ reducer: { users: (s = { userSidebar: { userDocs: [], userStarred: [] } }) => s } })
  render(
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, revalidateOnFocus: false }}>
        <SWRMutateBridge />
        <DocListTab tab="workspace" query={{}} view="grid" />
      </SWRConfig>
    </Provider>,
  )
  return store
}

const titles = () => screen.queryAllByRole("listitem").map((li) => li.textContent)

describe("a docs home list", () => {
  it("shows each doc once when a page it has is fetched again", async () => {
    renderTab()
    await waitFor(() => expect(titles()).toHaveLength(30))
    await act(async () => screen.getByText("More").click())
    await waitFor(() => expect(titles()).toHaveLength(32))
    // The second page was asked for with the cursor the first gave.
    expect(get.mock.calls.some(([url]) => String(url).includes("cursor=c30"))).toBe(true)
    await act(async () => {
      await appMutate((key: unknown) => typeof key === "string" && key.startsWith("/doc/list?"))
    })
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(4))
    expect(titles()).toHaveLength(32)
    expect(new Set(titles()).size).toBe(32)
  })

  it("shows a rename and drops a deleted doc, on any page loaded", async () => {
    const store = renderTab()
    await waitFor(() => expect(titles()).toHaveLength(30))
    await act(async () => screen.getByText("More").click())
    await waitFor(() => expect(titles()).toContain("Doc 31"))
    act(() => {
      docRenamed(store.dispatch, "d3", "Launch plan")
      docDeleted(store.dispatch, "d31")
    })
    await waitFor(() => expect(titles()).toContain("Launch plan"))
    expect(titles()).not.toContain("Doc 3")
    expect(titles()).not.toContain("Doc 31")
  })
})
