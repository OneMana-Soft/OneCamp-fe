import { act, cleanup, render } from "@testing-library/react"
import { memo, useReducer, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// F-1 #4 (FLUIDITY-LEAD, 20 Oct): a scroll re-rendered the whole timeline,
// 32,649 renders per scroll (TimelineBar×2508, StatusGlyph×2563). A scroll
// changes only the virtualiser's window: a row that stays in view must not
// render again.

const counts = vi.hoisted(() => ({ bar: 0, cell: 0, rerender: () => {} }))

vi.mock("@tanstack/react-virtual", () => ({
  // Every row is in view (jsdom lays nothing out); rerender stands for the
  // virtualiser's own update as the window scrolls.
  useVirtualizer: ({ count, estimateSize, scrollMargin = 0 }: { count: number; estimateSize: (i: number) => number; scrollMargin?: number }) => {
    const [, tick] = useReducer((n: number) => n + 1, 0)
    counts.rerender = tick
    let start = scrollMargin
    const items = Array.from({ length: count }, (_, index) => {
      const item = { index, key: index, start, size: estimateSize(index) }
      start += item.size
      return item
    })
    return { getVirtualItems: () => items, getTotalSize: () => start - scrollMargin, scrollToIndex: () => {} }
  },
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: false, mutate: () => Promise.resolve() }) }))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useSelector: () => "" }))
vi.mock("@/hooks/useTimelineView", async (orig) => ({ ...(await orig<typeof import("@/hooks/useTimelineView")>()), useTimelineView: () => ({ onScroll: () => {}, goToday: () => {} }) }))
vi.mock("./TimelineBar", async (orig) => {
  const real = await orig<typeof import("./TimelineBar")>()
  // Counted as the real bar is kept: re-drawn only when its props change.
  const Counted = memo(function CountedBar(props: ComponentProps<typeof real.TimelineBar>) {
    counts.bar++
    return <real.TimelineBar {...props} />
  })
  return { ...real, TimelineBar: Counted }
})
vi.mock("@/components/task/taskStatusCell", async (orig) => {
  const real = await orig<typeof import("@/components/task/taskStatusCell")>()
  return {
    ...real,
    TaskStatusCell: (props: ComponentProps<typeof real.TaskStatusCell>) => {
      counts.cell++
      return <real.TaskStatusCell {...props} />
    },
  }
})

const { ProjectTimeline } = await import("./ProjectTimeline")

afterEach(cleanup)

const day = (d: number) => new Date(2026, 9, d, 17).toISOString()
const tasks = Array.from({ length: 60 }, (_, i) => ({
  task_uuid: `t${i}`,
  task_name: `Task ${i}`,
  task_status: i % 3 === 0 ? "inProgress" : "todo",
  task_start_date: day(1 + (i % 20)),
  task_due_date: day(3 + (i % 20)),
}))

describe("scrolling the timeline", () => {
  it("draws no row again that stays in view", () => {
    render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} />)
    expect(counts.bar).toBeGreaterThan(0)
    counts.bar = 0
    counts.cell = 0
    for (let i = 0; i < 3; i++) act(() => counts.rerender())
    expect({ bars: counts.bar, names: counts.cell }).toEqual({ bars: 0, names: 0 })
  })
})
