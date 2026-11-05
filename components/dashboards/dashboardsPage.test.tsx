import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"

// The dashboards page's states and a keeper's changes (B9-b3, CR-B4 M3), with
// its reads mocked: a list or a dashboard that can't be read offers Try again;
// an empty dashboard asks its keeper for a widget and tells a reader its
// keepers haven't added one; a widget the server couldn't work out says why;
// a removed widget and a deleted dashboard each come back from Undo (the
// dashboard opening again); Move later sends the two places swapped.

const router = { replace: vi.fn(), push: vi.fn() }
let search = new URLSearchParams()
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => search }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isDesktop: true, isMobile: false }) }))
vi.mock("@/hooks/useProjectsOverview", () => ({ useProjectsOverview: () => ({ projects: [], isLoading: false }) }))
const offered: { title: string; undo: () => unknown }[] = []
vi.mock("@/components/ui/undoToast", () => ({
  useUndoToast: () => (title: string, undo: () => unknown) => {
    offered.push({ title, undo })
  },
}))
const lists = vi.fn()
const one = vi.fn()
vi.mock("@/hooks/useDashboards", () => ({
  useDashboardLists: (...a: unknown[]) => lists(...a),
  useDashboard: (...a: unknown[]) => one(...a),
}))

import { DashboardsPage } from "@/components/dashboards/DashboardsPage"

pinTestClock()

const D = "d0a50000-0000-4000-8000-0000000000b3"
const A = "a0000000-0000-4000-8000-000000000001"
const B = "a0000000-0000-4000-8000-000000000002"
const dashboard = { id: D, scope: "mine", name: "Weekly review", shared: false, created_by: "u1", created_at: "2026-11-02T09:00:00Z", updated_at: "2026-11-02T09:00:00Z" }
const metric = (id: string, x: number, measure: string) => ({ id, kind: "metric", title: "", query: { measure, weeks: 12 }, x, y: 0, w: 3, h: 2 })
const widgets = [metric(A, 0, "open"), metric(B, 3, "overdue")]

function listAnswer(over: Record<string, unknown> = {}) {
  return { lists: { mine: [dashboard], workspace: [], project: [], canMake: true }, isLoading: false, isError: false, refresh: vi.fn(async () => undefined), create: vi.fn(), ...over }
}
function oneAnswer(over: Record<string, unknown> = {}) {
  return {
    dashboard,
    widgets,
    canKeep: true,
    isLoading: false,
    isError: false,
    results: [
      { id: A, kind: "metric", data: { measure: "open", value: 7 } },
      { id: B, kind: "metric", error: "This widget reads a project you can't see." },
    ],
    resultsLoading: false,
    resultsError: false,
    refresh: vi.fn(async () => undefined),
    change: vi.fn(),
    remove: vi.fn(async () => undefined),
    restore: vi.fn(async () => undefined),
    addWidget: vi.fn(),
    changeWidget: vi.fn(),
    removeWidget: vi.fn(async () => undefined),
    restoreWidget: vi.fn(async () => undefined),
    arrange: vi.fn(async () => undefined),
    ...over,
  }
}

/** Opens a widget's menu and picks one of its items. */
function pick(widget: string, item: string) {
  const card = document.querySelector(`[data-widget-id="${widget}"]`) as HTMLElement
  fireEvent.keyDown(within(card).getByRole("button", { name: /: more$/ }), { key: "Enter" })
  fireEvent.click(screen.getByRole("menuitem", { name: item }))
}

beforeEach(() => {
  search = new URLSearchParams(`d=${D}`)
  offered.length = 0
  router.replace.mockClear()
  router.push.mockClear()
})
afterEach(cleanup)

describe("the dashboards page", () => {
  it("offers Try again when the list can't be read, and reads it again", () => {
    const l = listAnswer({ lists: undefined, isError: true })
    lists.mockReturnValue(l)
    one.mockReturnValue(oneAnswer())
    render(<DashboardsPage />)
    expect(screen.getByText("Couldn't load dashboards")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(l.refresh).toHaveBeenCalledTimes(1)
  })

  it("offers Try again when the dashboard can't be read, and reads it again", () => {
    lists.mockReturnValue(listAnswer())
    const o = oneAnswer({ dashboard: undefined, widgets: [], isError: true })
    one.mockReturnValue(o)
    render(<DashboardsPage />)
    expect(screen.getByText("Couldn't load this dashboard")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(o.refresh).toHaveBeenCalledTimes(1)
  })

  it("asks a keeper of an empty dashboard for a widget, and tells a reader its keepers haven't added one", () => {
    lists.mockReturnValue(listAnswer())
    one.mockReturnValue(oneAnswer({ widgets: [], results: [] }))
    render(<DashboardsPage />)
    expect(screen.getByText("Nothing on this dashboard yet")).toBeTruthy()
    expect(screen.getByText(/^Add a widget:/)).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Add widget" }).length).toBeGreaterThan(0)
    cleanup()
    one.mockReturnValue(oneAnswer({ widgets: [], results: [], canKeep: false, dashboard: { ...dashboard, scope: "workspace", shared: true } }))
    render(<DashboardsPage />)
    expect(screen.getByText("Nothing on this dashboard yet")).toBeTruthy()
    expect(screen.getByText("Its keepers haven't added a widget yet.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Add widget" })).toBeNull()
  })

  it("shows a widget's own words when the server couldn't work it out, beside one that could", () => {
    lists.mockReturnValue(listAnswer())
    one.mockReturnValue(oneAnswer())
    render(<DashboardsPage />)
    const bad = document.querySelector(`[data-widget-id="${B}"]`) as HTMLElement
    expect(within(bad).getByRole("status").textContent).toBe("This widget reads a project you can't see.")
    expect(document.querySelector(`[data-widget-id="${A}"]`)!.textContent).toContain("7")
  })

  // DB-114 F2 (B9-b3): a 20 px numeral at the top of a 160 px tile read unfinished.
  it("draws a number as its tile's hero, in Reports' own figure at its tile size", () => {
    lists.mockReturnValue(listAnswer())
    one.mockReturnValue(oneAnswer())
    render(<DashboardsPage />)
    const figure = document.querySelector(`[data-widget-id="${A}"] [data-kpi]`) as HTMLElement
    expect(figure.dataset.kpiSize).toBe("tile")
    expect(within(figure).getByText("7").className.split(/\s+/)).toEqual(expect.arrayContaining(["text-display", "tabular-nums"]))
    expect(figure.querySelector("dt")!.textContent).toBe("Open tasks")
  })

  it("brings a removed widget back from Undo", async () => {
    lists.mockReturnValue(listAnswer())
    const o = oneAnswer()
    one.mockReturnValue(o)
    render(<DashboardsPage />)
    pick(B, "Remove")
    await waitFor(() => expect(offered.map((x) => x.title)).toEqual(["Widget removed"]))
    expect(o.removeWidget).toHaveBeenCalledWith(B)
    expect(o.restoreWidget).not.toHaveBeenCalled()
    await act(async () => {
      await offered[0].undo()
    })
    expect(o.restoreWidget).toHaveBeenCalledWith(B)
  })

  it("brings a deleted dashboard back from Undo and opens it again", async () => {
    const l = listAnswer()
    lists.mockReturnValue(l)
    const o = oneAnswer()
    one.mockReturnValue(o)
    render(<DashboardsPage />)
    fireEvent.click(screen.getByRole("button", { name: "Delete dashboard" }))
    await waitFor(() => expect(offered.map((x) => x.title)).toEqual([`"Weekly review" deleted`]))
    expect(o.remove).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith("/app/project/dashboards", { scroll: false }))
    await act(async () => {
      await offered[0].undo()
    })
    expect(o.restore).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith(`/app/project/dashboards?d=${D}`, { scroll: false }))
  })

  it("sends the two places swapped when a widget moves later", async () => {
    lists.mockReturnValue(listAnswer())
    const o = oneAnswer()
    one.mockReturnValue(o)
    render(<DashboardsPage />)
    pick(A, "Move later")
    await waitFor(() => expect(o.arrange).toHaveBeenCalledTimes(1))
    expect(o.arrange).toHaveBeenCalledWith([
      { id: B, x: 0, y: 0, w: 3, h: 2 },
      { id: A, x: 3, y: 0, w: 3, h: 2 },
    ])
  })
})
