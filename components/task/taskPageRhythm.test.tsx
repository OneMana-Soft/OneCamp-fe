import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// The task page's properties in one rhythm (PTC-44, PTC-45): every value reads
// as text at rest on a touch screen too, and the Time row's controls are one
// style, starting where every other value does.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useTaskTime", () => ({
  useTaskTime: () => ({
    time: { seconds: 12900, entries: [{ id: "e1", started_at: "2026-10-14T09:00:00Z", ended_at: "2026-10-14T12:35:00Z", seconds: 12900, person: "Sam Rivera", mine: true, billable: true }] },
    add: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
  useRunningTimer: () => ({ running: null }),
  useElapsed: () => 0,
  startTimer: vi.fn(),
  stopTimer: vi.fn(),
}))

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k }) }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: vi.fn() }, OWN_ERRORS: {} }))
vi.mock("@/hooks/useTaskUpdate", () => ({ useTaskUpdate: () => ({ optimisticUpdateTasks: () => {} }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: () => Promise.resolve() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: false, isMobile: true, isTablet: false }) }))

const { TaskTimeSection } = await import("@/components/task/taskTimeSection")
const { inlineAffordance, inlineSelect } = await import("@/lib/ui/fieldRow")
const { TaskEstimateField } = await import("@/components/task/taskEstimateField")
const { DateProperty } = await import("@/components/task/taskDateField")
const { TaskStatusPriorityControl } = await import("@/components/task/taskStatusPriorityControl")

afterEach(cleanup)

describe("a task's values on a touch screen (PTC-44)", () => {
  it("show no chevron at rest, as status and priority show none: a tap opens them", () => {
    // The assignee had ⇅, the cycle and the channel ⌄, status and priority nothing.
    for (const style of [inlineAffordance, inlineSelect]) {
      expect(style).not.toMatch(/hover:none/)
      expect(style).toMatch(/opacity-0/)
    }
  })
})

describe("the Time row (PTC-45)", () => {
  it("draws Start as Log time is drawn, and starts each line where the other values start", () => {
    render(<TaskTimeSection taskUUID="t" />)
    const start = screen.getByRole("button", { name: /Start/ })
    const log = screen.getByRole("button", { name: /Log time/ })
    // Start was the one filled button in the panel.
    expect(start.className).not.toMatch(/bg-secondary/)
    for (const cls of ["h-7", "px-2", "font-normal", "text-ink-2"]) {
      expect(start.className.split(/\s+/), cls).toContain(cls)
      expect(log.className.split(/\s+/), cls).toContain(cls)
    }
    // The values sit 8px left of their column (propertyValue's -ml-2), and so does the row.
    expect((start.parentElement as HTMLElement).className.split(/\s+/)).toContain("-ml-2")
    expect(screen.getByRole("button", { name: /logged/ }).parentElement).toBe(start.parentElement)
  })
})


describe("the task page's own controls under a finger (PTC-14)", () => {
  it("take a 44px target: the dates, status, priority, a typed value and the time row", () => {
    render(
      <>
        <DateProperty bare isAdmin label="Due" value={new Date(2026, 9, 14)} onSelect={() => {}} />
        <TaskStatusPriorityControl isAdmin onSelectStatus={() => {}} onSelectPriority={() => {}} />
        <TaskEstimateField taskUUID="t" projectUUID="p" canEdit />
        <TaskTimeSection taskUUID="t" />
      </>,
    )
    for (const name of [/Due: 14 Oct/, /Status:/, /Priority:/, /Estimate|Add estimate/, /Start/, /Log time/]) {
      const control = screen.getAllByRole("button", { name }).find((b) => b.tagName === "BUTTON")!
      expect(control.hasAttribute("data-touch-target"), String(name)).toBe(true)
    }
  })
})
