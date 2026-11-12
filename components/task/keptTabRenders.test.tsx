import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, waitFor } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import desktopRightPanelSlice from "@/store/slice/desktopRightPanelSlice"
import { BUILT_IN_STATUSES } from "@/lib/taskStatus"
import { createSelectionStore } from "@/lib/listSelection"
import { ListSelectionContext } from "@/hooks/useListSelection"
import { Tabs } from "@/components/ui/tabs"
import { KeptTab, useSeenTabs } from "@/components/task/keptTabs"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The rows show dates (made): read against a fixed today.
pinTestClock()

// H3 (fluid-08, 6 Nov 2026, beta 2bf8fbacf): a project's list, kept in its tab
// once seen (keptTabs), drew all its rows again as another tab hid it: hidden,
// the drag's layer took its grips back (a layout effect's cleanup) and every
// row read the change, 1,900 rows mid-scroll of the board. A hidden list's
// rows draw nothing, and showing it again draws nothing either. Each row's
// title is counted.
const drawn = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock("@/components/task/TaskCheck", async (orig) => {
  const real = await orig<typeof import("@/components/task/TaskCheck")>()
  return {
    ...real,
    TaskTitle: (props: React.ComponentProps<typeof real.TaskTitle>) => {
      drawn.names.push(String(props.children))
      return <real.TaskTitle {...props} />
    },
  }
})
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({ msg: "ok" })), isSubmitting: false }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useBulkTaskUpdate", () => ({ useBulkTaskUpdate: () => vi.fn(async () => ({ changed: 1, failed: 0, unchanged: 0 })) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => true }))
vi.mock("@/lib/liveEntity", () => ({ useLiveEntity: () => ({ state: "none" }) }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ revalidateTaskKeys: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }) }))

const { GroupedTaskList, PROJECT_PROPS } = await import("@/components/task/GroupedTaskList")

// The drag's code (L-1) is fetched when the page is idle: here, when the test says so.
let idle: (() => void) | null = null
beforeAll(async () => {
  window.requestIdleCallback = ((cb: IdleRequestCallback) => {
    idle = () => cb({ didTimeout: false, timeRemaining: () => 50 })
    return 1
  }) as typeof window.requestIdleCallback
  window.cancelIdleCallback = () => undefined
  await import("@/components/task/listReorder")
}, 30_000)
afterEach(() => {
  cleanup()
  drawn.names = []
})

const tasks = Array.from({ length: 40 }, (_, i) => ({ task_uuid: `t${i}`, task_name: `Task ${i}`, task_status: i % 2 ? "inProgress" : "todo", task_priority: "medium", task_label: "", task_due_date: "", task_created_at: "2026-10-01T09:00:00Z" }) as unknown as TaskInfoInterface)
const canEdit = () => true
const MANUAL = { projectId: "p1", manual: true, onManual: () => undefined }
const store = configureStore({ reducer: { rightPanel: desktopRightPanelSlice.reducer } })
const selection = createSelectionStore()

/** A project's page as projectTaskDesktop draws it: each tab kept once seen. */
function Page({ tab }: { tab: "list" | "board" }) {
  const seen = useSeenTabs(tab)
  return (
    <Tabs value={tab}>
      <KeptTab value="list" selected={tab === "list"} seen={seen.has("list")}>
        <GroupedTaskList tasks={tasks} options={BUILT_IN_STATUSES} grouping="status" props={PROJECT_PROPS} canEdit={canEdit} projectId="p1" reorder={MANUAL} />
      </KeptTab>
      <KeptTab value="board" selected={tab === "board"} seen={seen.has("board")}>
        <p>The board</p>
      </KeptTab>
    </Tabs>
  )
}
const page = (tab: "list" | "board") => (
  <Provider store={store}>
    <ListSelectionContext.Provider value={selection}>
      <Page tab={tab} />
    </ListSelectionContext.Provider>
  </Provider>
)

// H3-b (fluid-09, 7 Nov, H3-1 592c8e2ae): the board's column drag reorders the
// project's statuses while the list is hidden; opening the timeline then drew
// the hidden list's 1,900 rows again (timelineOpen 52,127 -> 59,559 renders):
// the page drew again for the switch, its address changed, and the list read
// the new order from its cache. A hidden tab draws nothing until it is shown;
// shown, it draws the change once.
const statuses = { order: BUILT_IN_STATUSES, subs: new Set<() => void>() }
const reorderStatuses = () => {
  statuses.order = [...BUILT_IN_STATUSES].reverse()
  statuses.subs.forEach((f) => f())
}
const subscribe = (f: () => void) => (statuses.subs.add(f), () => void statuses.subs.delete(f))
const Address = React.createContext("")

/** The list as projectTaskTable draws it: its statuses from a cache, the address read. */
function CachedList() {
  const options = React.useSyncExternalStore(subscribe, () => statuses.order)
  React.useContext(Address)
  return <GroupedTaskList tasks={tasks} options={options} grouping="status" props={PROJECT_PROPS} canEdit={canEdit} projectId="p1" reorder={MANUAL} />
}

type Tab = "list" | "board" | "timeline"
function ThreeTabs({ tab }: { tab: Tab }) {
  const seen = useSeenTabs(tab)
  return (
    <Address.Provider value={`?tab=${tab}`}>
      <Tabs value={tab}>
        {(["list", "board", "timeline"] as const).map((t) => (
          <KeptTab key={t} value={t} selected={tab === t} seen={seen.has(t)}>
            {t === "list" ? <CachedList /> : <p>The {t}</p>}
          </KeptTab>
        ))}
      </Tabs>
    </Address.Provider>
  )
}
const three = (tab: Tab) => (
  <Provider store={store}>
    <ListSelectionContext.Provider value={selection}>
      <ThreeTabs tab={tab} />
    </ListSelectionContext.Provider>
  </Provider>
)

describe("a hidden tab", () => {
  afterEach(() => {
    statuses.order = BUILT_IN_STATUSES
  })

  it("draws no row for a change it can't show, and draws it once it is shown", async () => {
    const { container, rerender } = render(three("list"))
    act(() => idle?.())
    await waitFor(() => expect(container.querySelector("[data-reorder-grip]")).not.toBeNull())

    await act(async () => rerender(three("board")))
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    // The board's column drag.
    act(() => reorderStatuses())
    drawn.names = []

    await act(async () => rerender(three("timeline")))
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    expect(drawn.names, "the timeline opens with the list hidden").toEqual([])

    await act(async () => rerender(three("list")))
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    expect(drawn.names.length, "shown, each row draws the change once").toBe(tasks.length)
    expect(new Set(drawn.names).size).toBe(tasks.length)
    expect(container.querySelector("[data-reorder-grip]"), "its grips stay").not.toBeNull()
  })
})

describe("a kept tab's list, with the drag's layer in", () => {
  it("draws no row as another tab hides it, nor as it shows again, and keeps its grips", async () => {
    const { container, rerender } = render(page("list"))
    act(() => idle?.())
    await waitFor(() => expect(container.querySelector("[data-reorder-grip]")).not.toBeNull())
    drawn.names = []

    await act(async () => rerender(page("board")))
    // A hidden tree's updates render when there's time: let them.
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    expect(drawn.names, "the board hides the list").toEqual([])

    await act(async () => rerender(page("list")))
    await act(async () => new Promise((r) => setTimeout(r, 50)))
    expect(drawn.names, "the list shows again").toEqual([])
    expect(container.querySelector("[data-reorder-grip]"), "its grips stay").not.toBeNull()
  })
})
