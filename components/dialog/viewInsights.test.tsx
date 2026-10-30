import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import * as React from "react"
import { SWRConfig } from "swr"

// A doc's last 28 days in "Viewed by" (docs C6-3): members apart from a
// published page's visitors, the visitors said to be counted per day, a link
// to your own choice, and the doc's newest changes after its viewers.

const { get } = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get } }))

import { InsightsStrip, RecentChanges, useViewInsights, type Insights, type InsightsLoad } from "./viewInsights"

const days = (page: number) =>
  Array.from({ length: 28 }, (_, n) => ({ day: `d${n}`, member_views: n % 3, members: n % 2, page_views: n === 27 ? page : 0, visitors: n === 27 ? page : 0 }))
const answer = (page: number, events: Insights["events"] = []): Insights => ({
  from: "d0",
  days: days(page),
  members: 4,
  member_views: 27,
  page_views: page,
  visitor_days: page,
  events,
})
const ready = (i: Insights): InsightsLoad => ({ state: "ready", insights: i })

// A cache of its own per test: the app's reads share one.
const wrapper = ({ children }: { children: React.ReactNode }) => <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>

// Braces: a hook that returns a function has it called after the test, and
// get.mockReset() returns the mock itself.
beforeEach(() => {
  get.mockReset()
})
afterEach(cleanup)

describe("a doc's last 28 days", () => {
  it("is read once, quietly, for the doc", async () => {
    get.mockResolvedValue({ data: { data: answer(6) } })
    const { result } = renderHook(() => useViewInsights("/doc/getInsights", "doc_uuid", "d1", true), { wrapper })
    await waitFor(() => expect(result.current?.state).toBe("ready"))
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0][0]).toBe("/doc/getInsights?doc_uuid=d1")
    expect(get.mock.calls[0][1]).toMatchObject({ suppressErrorToast: true })
  })

  it("reads nothing for a resource without insights", () => {
    const { result } = renderHook(() => useViewInsights(undefined, "board_uuid", "b1", true), { wrapper })
    expect(result.current).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })

  it("reads nothing while the dialog is closed, and shows the last answer at once when it opens again", async () => {
    get.mockResolvedValue({ data: { data: answer(6) } })
    const { result, rerender } = renderHook(({ open }) => useViewInsights("/doc/getInsights", "doc_uuid", "d1", open), { wrapper, initialProps: { open: false } })
    expect(result.current?.state).toBe("loading")
    expect(get).not.toHaveBeenCalled()
    rerender({ open: true })
    await waitFor(() => expect(result.current?.state).toBe("ready"))
    rerender({ open: false })
    rerender({ open: true })
    expect(result.current?.state).toBe("ready")
  })

  it("names its window, and shows members, and visitors apart, counted per day, and links to your own choice", () => {
    render(<InsightsStrip load={ready(answer(6))} hue="lake" />)
    expect(screen.getByRole("region", { name: "Last 28 days" })).toBeInTheDocument()
    expect(document.querySelector("[data-spark] path")).toHaveAttribute("stroke", "var(--camp-lake)")
    expect(screen.getByText("Page visitors", { exact: true })).toBeInTheDocument()
    expect(screen.getByText("27 views")).toBeInTheDocument()
    expect(screen.getByText(/counted per day/)).toBeInTheDocument()
    expect(document.querySelector("[data-spark]")).not.toBeNull()
    expect(screen.getByRole("link", { name: "Change whether your views are recorded" })).toHaveAttribute("href", "/app/settings/notifications#notifications-doc-views")
  })

  it("leaves visitors out when the doc has no page visits, and draws its line in ink without a hue", () => {
    render(<InsightsStrip load={ready(answer(0))} />)
    expect(document.querySelector("[data-spark] path")).toHaveAttribute("stroke", "var(--ink-2)")
    expect(screen.getByText("Members", { exact: true })).toBeInTheDocument()
    expect(screen.queryByText("Page visitors", { exact: true })).toBeNull()
    expect(screen.queryByText(/counted per day/)).toBeNull()
  })

  it("says a failed read in one line, with Try again", () => {
    const retry = vi.fn()
    render(<InsightsStrip load={{ state: "failed", retry }} />)
    expect(screen.getByText(/Couldn't load the last 28 days/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("reads again on Try again after a failed read", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: { data: answer(6) } })
    const { result } = renderHook(() => useViewInsights("/doc/getInsights", "doc_uuid", "d1", true), { wrapper })
    await waitFor(() => expect(result.current?.state).toBe("failed"))
    const failed = result.current
    act(() => {
      if (failed?.state === "failed") failed.retry()
    })
    await waitFor(() => expect(result.current?.state).toBe("ready"))
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe("the doc's recent changes", () => {
  it("names who made each, an agent and the server too", () => {
    const at = new Date().toISOString()
    render(
      <RecentChanges
        load={ready(
          answer(0, [
            { action: "doc.published", summary: "Published ‘Launch notes’", actor_kind: "human", actor: "Maya Patel", at },
            { action: "agent.doc.shared", summary: "Shared ‘Launch notes’ with 1 person", actor_kind: "agent", actor: "Sam Rivera", at },
            { action: "doc.purged", summary: "Deleted a page for good", actor_kind: "system", at },
          ]),
        )}
      />,
    )
    expect(screen.getByRole("region", { name: "Recent changes" })).toBeInTheDocument()
    expect(screen.getByText("Published ‘Launch notes’")).toBeInTheDocument()
    expect(screen.getByText(/^Maya Patel · /)).toBeInTheDocument()
    expect(screen.getByText(/^An agent for Sam Rivera · /)).toBeInTheDocument()
    expect(screen.getByText(/^OneCamp · /)).toBeInTheDocument()
  })

  it("shows nothing without changes, or before the read", () => {
    const { container } = render(<RecentChanges load={ready(answer(0))} />)
    expect(container).toBeEmptyDOMElement()
    cleanup()
    const loading = render(<RecentChanges load={{ state: "loading" }} />)
    expect(loading.container).toBeEmptyDOMElement()
  })
})
