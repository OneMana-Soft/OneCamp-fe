import { act, cleanup, render } from "@testing-library/react"
import { memo, useReducer, type ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// F-1 #4 (FLUIDITY-LEAD, 20 Oct): a scroll re-rendered the whole timeline,
// 32,649 renders per scroll (TimelineBar×2508, StatusGlyph×2563). A scroll
// changes only the virtualiser's window: a row that stays in view must not
// render again.
// H3 (FLUIDITY-18, 6 Nov): the tool row drew again on every scroll step too,
// its Display menu x59 and Buttons x236 of timelineScroll's 3,550 renders.

const counts = vi.hoisted(() => ({ bar: 0, cell: 0, menu: 0, zoom: 0, rerender: () => {} }))

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
vi.mock("@/hooks/useFetch", () => {
  const nothing = () => ({ data: undefined, isLoading: false, isError: false, mutate: () => Promise.resolve() })
  return { useFetch: nothing, useFetchOnlyOnce: nothing }
})
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useSelector: () => "" }))
vi.mock("@/hooks/useTimelineView", async (orig) => ({ ...(await orig<typeof import("@/hooks/useTimelineView")>()), useTimelineView: ({ scrollRef }: { scrollRef: { current: HTMLDivElement | null } }) => ({ onScroll: () => {}, goToday: () => {}, scrollerRef: (el: HTMLDivElement | null) => void (scrollRef.current = el) }) }))
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

vi.mock("@/components/ui/dropdown-menu", async (orig) => {
  const real = await orig<typeof import("@/components/ui/dropdown-menu")>()
  return {
    ...real,
    DropdownMenu: (props: ComponentProps<typeof real.DropdownMenu>) => {
      counts.menu++
      return <real.DropdownMenu {...props} />
    },
  }
})
vi.mock("./ZoomSwitch", async (orig) => {
  const real = await orig<typeof import("./ZoomSwitch")>()
  return {
    ...real,
    ZoomSwitch: (props: ComponentProps<typeof real.ZoomSwitch>) => {
      counts.zoom++
      return <real.ZoomSwitch {...props} />
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

  it("draws no tool row again: the Display menu and the zoom switch stay as they are", () => {
    const create = () => {}
    render(<ProjectTimeline projectId="p" tasks={tasks} onOpenTask={() => {}} onCreateTask={create} />)
    expect(counts.menu).toBeGreaterThan(0)
    counts.menu = 0
    counts.zoom = 0
    for (let i = 0; i < 3; i++) act(() => counts.rerender())
    expect({ menus: counts.menu, zooms: counts.zoom }).toEqual({ menus: 0, zooms: 0 })
  })
})
