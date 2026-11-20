import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"

// gcal-14 web: a project's, a channel's and a team's own calendar, opened from where each lives,
// and the entries those calendars fill themselves with (tasks, milestones, Away), read only.
const post = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post, get: vi.fn() } }))
const net = vi.hoisted(() => ({ offline: false }))
vi.mock("@/lib/connectivity", async (orig) => ({ ...(await orig<object>()), isAppOffline: () => net.offline }))
const push = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
const swrMutate = vi.hoisted(() => vi.fn())
vi.mock("swr", async (orig) => ({ ...(await orig<object>()), useSWRConfig: () => ({ mutate: swrMutate }) }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), toast }))

import { LIST_URL, openingProblem, useContainerCalendar, type ContainerKind } from "./useContainerCalendar"
import { calendarListUrl } from "./calendarList"
import { derivedSource } from "./derived"
import { asGridEvent } from "./otherCalendars"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

afterEach(() => {
  cleanup()
  post.mockReset()
  push.mockReset()
  toast.mockReset()
  swrMutate.mockReset()
  net.offline = false
})

describe("W1: one opener for a project's, a channel's and a team's calendar", () => {
  it.each<[ContainerKind, string]>([
    ["project", "/calendar/projects/p-1/calendar"],
    ["channel", "/calendar/channels/p-1/calendar"],
    ["team", "/calendar/teams/p-1/calendar"],
  ])("asks the server for the %s's own calendar and opens the calendar showing it", async (kind, url) => {
    post.mockResolvedValueOnce({ data: { data: { id: "cal-9" } } })
    const { result } = renderHook(() => useContainerCalendar(kind, "p-1"))
    await act(() => result.current.open())
    expect(post).toHaveBeenCalledWith(url, undefined, expect.anything())
    expect(swrMutate).toHaveBeenCalledWith("/calendar/calendars")
    expect(LIST_URL).toBe(calendarListUrl)
    expect(push).toHaveBeenCalledWith("/app/calendar?calendar=cal-9")
  })

  // V-1043: opened from a sheet (a channel's details), the sheet closes as the
  // calendar opens, and stays open when it can't, so its person can try again.
  it("closes the place it was opened from as it goes, and only when it goes", async () => {
    const order: string[] = []
    push.mockImplementation(() => void order.push("push"))
    const leave = vi.fn(() => void order.push("leave"))
    post.mockResolvedValueOnce({ data: { data: { id: "cal-9" } } })
    const { result } = renderHook(() => useContainerCalendar("channel", "c-1", leave))
    await act(() => result.current.open())
    expect(order).toEqual(["leave", "push"])
    leave.mockClear()
    post.mockRejectedValueOnce({ response: { status: 404, data: { msg: "Not found" } } })
    await act(() => result.current.open())
    net.offline = true
    await act(() => result.current.open())
    expect(leave).not.toHaveBeenCalled()
  })

  it("puts an id into its addresses safely", async () => {
    post.mockResolvedValueOnce({ data: { data: { id: "cal 9" } } })
    const { result } = renderHook(() => useContainerCalendar("team", "t/1"))
    await act(() => result.current.open())
    expect(post).toHaveBeenCalledWith("/calendar/teams/t%2F1/calendar", undefined, expect.anything())
    expect(push).toHaveBeenCalledWith("/app/calendar?calendar=cal%209")
  })

  it("says only that it isn't available when the server answers 404, and opens nothing", async () => {
    post.mockRejectedValueOnce({ response: { status: 404, data: { msg: "Not found" } } })
    const { result } = renderHook(() => useContainerCalendar("channel", "c-1"))
    await act(() => result.current.open())
    expect(push).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "This channel's calendar isn't available." }))
  })

  it("asks nothing while offline, and says it can't open now", async () => {
    net.offline = true
    const { result } = renderHook(() => useContainerCalendar("team", "t-1"))
    await act(() => result.current.open())
    expect(post).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "You're offline. Open it when you're back online." }))
    expect(openingProblem({ response: { status: 500 } }, "team")).toBe("Its calendar couldn't be opened. Try again in a moment.")
  })

  it("is the only caller of the container calendar address, and the project, channel and team pages each use it", () => {
    const root = join(__dirname, "../..")
    const callers: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(root, dir))) {
        const rel = join(dir, name)
        if (statSync(join(root, rel)).isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && /(projects|channels|teams)\/\$\{[^}]+\}\/calendar|\$\{kind\}s\//.test(readFileSync(join(root, rel), "utf8"))) callers.push(rel)
      }
    }
    for (const dir of ["app", "components", "lib", "hooks"]) walk(dir)
    expect(callers).toEqual(["lib/calendar/useContainerCalendar.ts"])
    // No chunk of its own (size round W3): a lazy opener carried swr and the API client, the shared core, into a new chunk group.
    expect(readFileSync(join(root, "lib/calendar/useContainerCalendar.ts"), "utf8")).not.toMatch(/import\(/)
    const uses = (file: string, kind: ContainerKind) => expect(readFileSync(join(root, file), "utf8")).toMatch(new RegExp(`useContainerCalendar\\("${kind}"`))
    uses("components/project/ProjectToolButtons.tsx", "project")
    uses("components/channel/details/channelDetailsSheet.tsx", "channel")
    uses("components/team/teamCalendarButton.tsx", "team")
  })
})

describe("W3: an entry a calendar fills itself with comes from its source, read only", () => {
  const project = { id: "cal-p", name: "Launch", kind: "project", container_kind: "project", container_id: "p-1", access: "edit" as const }
  const team = { id: "cal-t", name: "Design", kind: "team", container_kind: "team", container_id: "t-1", access: "view" as const }
  const api = (p: object) => ({ calendar_id: "cal-p", title: "Ship beta", start: { date: "2026-11-13" }, end: { date: "2026-11-14" }, all_day: true, kind: "event", ...p })

  it("carries read_only and where it comes from (a task, a milestone, a person's time off) onto the grid's event, with its link", () => {
    const task = asGridEvent({ id: "task:t-1", read_only: true, source: { kind: "task", id: "t-1" }, ...api({}) } as never, project)
    expect(task.event_read_only).toBe(true)
    expect(task.event_source).toEqual({ kind: "task", id: "t-1", href: "/app/task/t-1", open: "Open task", from: "A task in Launch" })
    const mark = asGridEvent({ id: "milestone:m-1", read_only: true, source: { kind: "milestone", id: "m-1" }, ...api({ title: "Beta" }) } as never, project)
    expect(mark.event_source).toEqual({ kind: "milestone", id: "m-1", href: "/app/project/p-1?tab=updates", open: "Open milestone", from: "A milestone of Launch" })
    const away = asGridEvent(
      { id: "away:u-1:1763000000", read_only: true, source: { kind: "person", id: "u-1" }, ...api({ calendar_id: "cal-t", kind: "out_of_office", title: "Away" }) } as never,
      team,
    )
    expect(away.event_is_away).toBe(true)
    expect(away.event_source).toEqual({ kind: "person", id: "u-1", href: "/app/user/u-1", open: "Open profile", from: "Time off, on Design's calendar" })
  })

  it("says nothing of an event someone made, and nothing of a source it doesn't know", () => {
    expect(asGridEvent({ id: "e-1", ...api({}) } as never, project).event_source).toBeUndefined()
    expect(derivedSource({ kind: "doc", id: "d-1" }, project)).toBeNull()
    expect(derivedSource({ kind: "milestone", id: "m-1" }, team)).toBeNull()
  })
})
