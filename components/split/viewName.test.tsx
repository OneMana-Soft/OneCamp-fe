import type React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { combineReducers, configureStore } from "@reduxjs/toolkit"
import { SWRConfig } from "swr"

// A doc or a task opened beside the page, and never a recent visit, was
// called by its kind ("Doc") in its bar, its region, its chip once tucked
// and its toasts: a view's name came only from the sidebar's lists or a
// recent visit (split view, 21 Oct). Its own view fetches its name; every
// place that names a view now reads it there, and follows a rename. Real
// SWR and a real store; only the views themselves are stood in for.

vi.mock("next/dynamic", () => ({ default: () => () => null }))
vi.mock("next/navigation", () => ({ usePathname: () => "/app/channel/c1", useRouter: () => ({ push: () => {} }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
vi.mock("@/components/conversation/ConversationView", () => ({
  ConversationView: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDmConversation: () => null,
}))

import userSlice from "@/store/slice/userSlice"
import { recentItemsSlice } from "@/store/slice/recentItemsSlice"
import splitSlice from "@/store/slice/splitSlice"
import { openInSplit } from "@/store/slice/splitActions"
import { SWRMutateBridge } from "@/components/providers/SWRMutateBridge"
import { TooltipProvider } from "@/components/ui/tooltip"
import { appMutate } from "@/lib/swrMutate"
import { docInfoKey, docRenamed } from "@/lib/docCache"
import { GetEndpointUrl } from "@/services/endPoints"
import type { Pane } from "@/lib/split"
import { SplitPane } from "./SplitPane"
import { TuckedViews } from "./TuckedViews"
import { viewLook } from "./paneLook"

const DOC: Pane = { kind: "doc", id: "d9" }
const TASK: Pane = { kind: "task", id: "t7" }

function setup(ui: (panes: Pane[]) => React.ReactNode) {
  const store = configureStore({
    reducer: combineReducers({ users: userSlice.reducer, recentItems: recentItemsSlice.reducer, split: splitSlice.reducer }),
  })
  const panes = [DOC, TASK]
  for (const p of panes) store.dispatch(openInSplit(p))
  render(
    <Provider store={store}>
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <SWRMutateBridge />
        <TooltipProvider>{ui(panes)}</TooltipProvider>
      </SWRConfig>
    </Provider>,
  )
  return store
}

/** What the doc's and the task's own views put in the cache once they have loaded. */
const loaded = (doc: string, task?: string) =>
  act(async () => {
    await appMutate(docInfoKey(DOC.id), { data: { doc_uuid: DOC.id, doc_title: doc } }, false)
    if (task !== undefined) await appMutate(`${GetEndpointUrl.GetTaskInfo}/${TASK.id}`, { data: { task_uuid: TASK.id, task_name: task } }, false)
  })

const panes = (list: Pane[]) =>
  list.map((pane, i) => <SplitPane key={pane.id} pane={pane} index={i} at={i + 1} count={list.length + 1} active={false} focused={false} shown />)

afterEach(cleanup)

describe("a view beside the page that the sidebar doesn't list", () => {
  it("is named in its bar and its region by what its own view loaded, once it has, and after a rename", async () => {
    const store = setup(panes)
    // Before the doc's view has its answer, the kind stands in.
    expect(screen.getByRole("region", { name: "Doc, view 2 of 3" })).toBeTruthy()
    await loaded("Q4 launch plan", "Book the launch retro")
    const doc = await screen.findByRole("region", { name: "Q4 launch plan, view 2 of 3" })
    expect(doc.querySelector(".split-bar")?.textContent).toContain("Q4 launch plan")
    expect(await screen.findByRole("region", { name: "Book the launch retro, view 3 of 3" })).toBeTruthy()
    // Renamed in its own title, or anywhere else: the bar follows.
    await act(async () => docRenamed(store.dispatch, DOC.id, "Q4 launch plan, final"))
    expect(await screen.findByRole("region", { name: "Q4 launch plan, final, view 2 of 3" })).toBeTruthy()
  })

  it("is named by its chip when tucked away, and in the words its toasts say", async () => {
    const store = setup(() => <TuckedViews keys={`doc:${DOC.id},task:${TASK.id}`} />)
    await loaded("Q4 launch plan", "Book the launch retro")
    expect(await screen.findByRole("button", { name: "Bring back Q4 launch plan" })).toBeTruthy()
    // A move's, a swap's or a make-room close's toast reads it when it is told.
    const s = store.getState()
    expect(viewLook(s, s.split, `doc:${DOC.id}`).name).toBe("Q4 launch plan")
    expect(viewLook(s, s.split, `task:${TASK.id}`).name).toBe("Book the launch retro")
  })

  it("is Untitled as the doc's own page says, for a doc with no title", async () => {
    setup(panes)
    await loaded("  ")
    expect(await screen.findByRole("region", { name: "Untitled, view 2 of 3" })).toBeTruthy()
  })
})
