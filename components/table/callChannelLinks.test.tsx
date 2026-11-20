import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import * as React from "react"

// A link cell that takes a channel or a call (airtable-01): a channel is found by the workspace search, as every
// picker that links one reads a hit (lib/search/hitRef); a call by GET /calls/linkable, the reader's own readable
// calls, newest first. The server names each link for its reader and sends one they can't open hidden. A channel's
// chip opens the channel; a call's opens its huddle post when the call has one (GET /calls/{id}), else its
// conversation, and is never a dead link. The tables page holds the router: it hands the cells its opener
// (services/callPlaceService, a chunk of its own), so a table without one (a guest's, a doc's) shows a call by name.

const ME = "00000000-0000-4000-8000-0000000000aa"
const THEM = "00000000-0000-4000-8000-0000000000bb"
const { search, get, push, toast } = vi.hoisted(() => ({ search: vi.fn(), get: vi.fn(), push: vi.fn(), toast: vi.fn() }))
vi.mock("@/services/searchService", () => ({ useGlobalSearch: () => ({ search }) }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get } }))
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), toast }))
vi.mock("@/lib/swrMutate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/swrMutate")>()),
  cachedData: (key: string) => (key === "/user/profile" ? { data: { user_uuid: ME } } : undefined),
}))

import { RelationCell } from "@/components/table/RelationCell"
import { cellPickers } from "@/components/table/cellPickerPart"
import { openCall } from "@/services/callPlaceService"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

/** The tables page's call opener, as it hands it to the cells: the page's router opens what GET /calls/{id} says. */
const opener = (id: string) => void openCall(id, push)

beforeAll(() => cellPickers.warm())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  for (const f of [search, get, push, toast]) f.mockReset()
})

/** GET /calls/linkable answers these calls (to every query, or by a title's words); GET /calls/{id} answers by id. */
function callsAnswer(calls: { id: string; title: string }[], sessions: Record<string, object | number> = {}) {
  get.mockImplementation(async (url: string, config?: { params?: { q?: string } }) => {
    if (url === "/calls/linkable") {
      const q = (config?.params?.q ?? "").toLowerCase()
      return { data: { calls: calls.filter((c) => c.title.toLowerCase().includes(q)).map((c) => ({ ...c, started_at: "2026-11-16T09:00:00Z", conversation_kind: "channel" })) } }
    }
    const answer = sessions[url.replace("/calls/", "")]
    if (typeof answer === "number" || answer === undefined) throw Object.assign(new Error("no"), { response: { status: answer ?? 404 } })
    return { data: { data: { live: false, session: answer } } }
  })
}

const openPicker = () => fireEvent.click(screen.getByRole("button", { name: "Add a link" }))

describe("linking a row to a call", () => {
  it("lists the reader's calls before anything is typed, finds one by its words, and links it by id", async () => {
    callsAnswer([
      { id: "k1", title: "Call in #general, 16 Nov 2026" },
      { id: "k2", title: "Standup" },
    ])
    const committed = vi.fn()
    render(<RelationCell value={[]} target="call" onCommit={committed} />)
    openPicker()
    await waitFor(() => expect(screen.getByRole("option", { name: /Call in #general/ })).toBeTruthy())
    expect(screen.getByRole("option", { name: /Standup/ })).toBeTruthy()
    expect(get).toHaveBeenCalledWith("/calls/linkable", expect.objectContaining({ params: { q: "", limit: 50 } }))
    fireEvent.change(screen.getByRole("textbox", { name: "Search calls" }), { target: { value: "stand" } })
    await waitFor(() => expect(screen.queryByRole("option", { name: /Call in #general/ })).toBeNull())
    expect(get).toHaveBeenLastCalledWith("/calls/linkable", expect.objectContaining({ params: { q: "stand", limit: 50 } }))
    fireEvent.click(screen.getByRole("option", { name: /Standup/ }))
    // Written as its id and type: the server names it for each reader.
    expect(committed).toHaveBeenCalledWith([{ id: "k2", type: "call" }])
  })

  it("says when there are no calls yet, and that only the newest 500 are searched when none match", async () => {
    callsAnswer([])
    render(<RelationCell value={[]} target="call" onCommit={vi.fn()} />)
    openPicker()
    await waitFor(() => expect(screen.getByText("No calls to link yet")).toBeTruthy())
    fireEvent.change(screen.getByRole("textbox", { name: "Search calls" }), { target: { value: "retro" } })
    await waitFor(() => expect(screen.getByText(/Nothing matches “retro”/)).toBeTruthy())
    expect(screen.getByText(/Only your 500 newest calls are searched/)).toBeTruthy()
  })

  it("says a failed listing in place, with Try again, and lists the calls once it answers", async () => {
    get.mockRejectedValueOnce(Object.assign(new Error("down"), { response: { status: 503 } }))
    render(<RelationCell value={[]} target="call" onCommit={vi.fn()} />)
    openPicker()
    await waitFor(() => expect(screen.getByText("Couldn't load calls")).toBeTruthy())
    callsAnswer([{ id: "k2", title: "Standup" }])
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(screen.getByRole("option", { name: /Standup/ })).toBeTruthy())
    expect(screen.queryByText("Couldn't load calls")).toBeNull()
  })

  it("says it's offline instead of searching, and lists the calls once the app is back", async () => {
    callsAnswer([{ id: "k2", title: "Standup" }])
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false)
    render(<RelationCell value={[]} target="call" onCommit={vi.fn()} />)
    openPicker()
    await waitFor(() => expect(screen.getByText(/You're offline/)).toBeTruthy())
    expect(get).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    window.dispatchEvent(new Event("online"))
    await waitFor(() => expect(screen.getByRole("option", { name: /Standup/ })).toBeTruthy())
  })
})

describe("linking a row to a channel", () => {
  it("finds a channel through the workspace search, and nothing a channel link can't take", async () => {
    search.mockResolvedValue({
      page: [
        { type: "channel", channel: { ch_id: "c1", ch_name: "general", ch_private: false } },
        { type: "task", task: { task_id: "t1", task_name: "General cleanup" } },
      ],
    })
    const committed = vi.fn()
    render(<RelationCell value={[]} target="channel" onCommit={committed} />)
    openPicker()
    expect(screen.getByText("Type to search")).toBeTruthy()
    fireEvent.change(screen.getByRole("textbox", { name: "Search channels" }), { target: { value: "gen" } })
    await waitFor(() => expect(screen.getByRole("option", { name: /general/ })).toBeTruthy())
    expect(screen.queryByRole("option", { name: /General cleanup/ })).toBeNull()
    fireEvent.click(screen.getByRole("option", { name: /general/ }))
    expect(committed).toHaveBeenCalledWith([{ id: "c1", type: "channel" }])
  })

  it("says a failed search in place, with Try again", async () => {
    search.mockRejectedValueOnce(new Error("down"))
    render(<RelationCell value={[]} target="channel" onCommit={vi.fn()} />)
    openPicker()
    fireEvent.change(screen.getByRole("textbox", { name: "Search channels" }), { target: { value: "gen" } })
    await waitFor(() => expect(screen.getByText("Couldn't load search results")).toBeTruthy())
    search.mockResolvedValue({ page: [{ type: "channel", channel: { ch_id: "c1", ch_name: "general" } }] })
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    await waitFor(() => expect(screen.getByRole("option", { name: /general/ })).toBeTruthy())
  })
})

describe("a link to anything", () => {
  it("finds channels in the search and the reader's calls after them", async () => {
    search.mockResolvedValue({ page: [{ type: "channel", channel: { ch_id: "c1", ch_name: "launch" } }] })
    callsAnswer([{ id: "k3", title: "Launch review" }])
    const committed = vi.fn()
    render(<RelationCell value={[]} target="any" onCommit={committed} />)
    openPicker()
    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks, docs and people" }), { target: { value: "launch" } })
    await waitFor(() => expect(screen.getByRole("option", { name: /Launch review/ })).toBeTruthy())
    const names = screen.getAllByRole("option").map((o) => o.textContent)
    expect(names[0]).toMatch(/launch/)
    expect(names[1]).toMatch(/Launch review/)
    fireEvent.click(screen.getByRole("option", { name: /Launch review/ }))
    expect(committed).toHaveBeenCalledWith([{ id: "k3", type: "call" }])
  })

  it("keeps what the search found when the calls can't be listed", async () => {
    search.mockResolvedValue({ page: [{ type: "channel", channel: { ch_id: "c1", ch_name: "launch" } }] })
    get.mockRejectedValue(Object.assign(new Error("down"), { response: { status: 503 } }))
    render(<RelationCell value={[]} target="any" onCommit={vi.fn()} />)
    openPicker()
    fireEvent.change(screen.getByRole("textbox", { name: "Search tasks, docs and people" }), { target: { value: "launch" } })
    await waitFor(() => expect(screen.getByRole("option", { name: /launch/ })).toBeTruthy())
    expect(screen.queryByText(/Couldn't load/)).toBeNull()
  })
})

describe("a channel's and a call's chips", () => {
  const value = [
    { id: "c1", type: "channel", label: "general" },
    { id: "k1", type: "call", label: "Call in #general, 16 Nov 2026" },
    { id: "k9", type: "call", hidden: true },
    { id: "c9", type: "channel", hidden: true },
  ]

  it("name what the server named, open a channel at its page, and keep what the reader can't open in the one hidden chip", () => {
    render(<RelationCell value={value} target="any" openCall={opener} onCommit={vi.fn()} />)
    expect(screen.getByRole("link", { name: "general" }).getAttribute("href")).toBe("/app/channel/c1")
    expect(screen.getByRole("button", { name: "Call in #general, 16 Nov 2026" })).toBeTruthy()
    const hidden = document.querySelector("[data-relation-hidden]") as HTMLElement
    expect(hidden.textContent).toContain("2 things you can't open")
    expect(within(hidden).queryByRole("link")).toBeNull()
    expect(within(hidden).queryByRole("button")).toBeNull()
    expect(document.body.textContent).not.toMatch(/k9|c9/)
  })

  it("open a call at its huddle post when it has one", async () => {
    callsAnswer([], { k1: { id: "k1", kind: "channel", resource: { kind: "channel", id: "ch1" }, post_uuid: "p1" } })
    render(<RelationCell value={value} target="call" openCall={opener} onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Call in #general, 16 Nov 2026" }))
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/channel/ch1/p1"))
    expect(get).toHaveBeenCalledWith("/calls/k1", expect.anything())
  })

  it("open a call with no huddle post at its conversation: a channel, a DM with the other person, a group", async () => {
    callsAnswer([], {
      k1: { id: "k1", kind: "channel", resource: { kind: "channel", id: "ch1" } },
      k2: { id: "k2", kind: "dm", resource: { kind: "dm", id: [ME, THEM].sort().join(" ") } },
      k3: { id: "k3", kind: "group", resource: { kind: "group", id: "g1" } },
    })
    const calls = [
      { id: "k1", type: "call", label: "In general" },
      { id: "k2", type: "call", label: "With Sam" },
      { id: "k3", type: "call", label: "With the team" },
    ]
    render(<RelationCell value={calls} target="call" openCall={opener} onCommit={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "In general" }))
    await waitFor(() => expect(push).toHaveBeenLastCalledWith("/app/channel/ch1"))
    fireEvent.click(screen.getByRole("button", { name: "With Sam" }))
    await waitFor(() => expect(push).toHaveBeenLastCalledWith(`/app/chat/${THEM}`))
    fireEvent.click(screen.getByRole("button", { name: "With the team" }))
    await waitFor(() => expect(push).toHaveBeenLastCalledWith("/app/chat/group/g1"))
  })

  it("say why a call doesn't open rather than go nowhere: a meeting has no conversation, a call gone or out of reach, a failed read", async () => {
    callsAnswer([], { k1: { id: "k1", kind: "meeting", resource: { kind: "meeting", id: "m1" } }, k2: 404, k3: 503 })
    const calls = [
      { id: "k1", type: "call", label: "Instant meeting" },
      { id: "k2", type: "call", label: "Gone" },
      { id: "k3", type: "call", label: "Flaky" },
    ]
    render(<RelationCell value={calls} target="call" openCall={opener} onCommit={vi.fn()} />)
    for (const [name, n] of [["Instant meeting", 1], ["Gone", 2], ["Flaky", 3]] as const) {
      fireEvent.click(screen.getByRole("button", { name }))
      await waitFor(() => expect(toast).toHaveBeenCalledTimes(n))
    }
    expect(push).not.toHaveBeenCalled()
    expect(toast.mock.calls[2][0]).toMatchObject({ tone: "error" })
  })

  it("never open from a cell the reader can't change: its chips are names only", () => {
    render(<RelationCell value={value} target="any" readOnly openCall={opener} onCommit={vi.fn()} />)
    expect(screen.queryByRole("link", { name: "general" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Call in #general/ })).toBeNull()
    expect(screen.getByText("Call in #general, 16 Nov 2026")).toBeTruthy()
  })

  it("show a call by name where no page hands them an opener (a guest's table, a doc's): never a button that goes nowhere", () => {
    render(<RelationCell value={value} target="any" onCommit={vi.fn()} />)
    // By its exact name: the chip's "Unlink Call in #general, …" button is there, and opens nothing.
    expect(screen.queryByRole("button", { name: "Call in #general, 16 Nov 2026" })).toBeNull()
    expect(screen.getByText("Call in #general, 16 Nov 2026")).toBeTruthy()
    expect(screen.getByRole("link", { name: "general" }).getAttribute("href")).toBe("/app/channel/c1")
  })
})
