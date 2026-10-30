import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import type { CallActivities } from "@/lib/calls/activities"
import { doActivity, readActivities } from "./callActivitiesService"

// A call's polls and questions' requests (calls package A): a member asks as
// themselves, a guest by the call token they joined with, never through the
// signed-in instance; a refusal that stays is told from a trouble that passes.

const get = axiosInstance.get as unknown as ReturnType<typeof vi.fn>
const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>
const activities: CallActivities = { polls: [], questions: [], qa: { open: true, shown: "all", anonymous: false }, runs: false }
const failed = (status: number, msg = "", code?: string) => Object.assign(new Error("failed"), { isAxiosError: true, response: { status, data: { msg, code } } })
const answer = (status: number, body?: unknown) => ({ ok: status < 300, status, json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body), headers: { get: () => null } })
const fetchMock = vi.fn()

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("a member's polls and questions", () => {
  it("reads them by the call's id", async () => {
    get.mockResolvedValueOnce({ status: 200, data: { data: activities } })
    expect(await readActivities({ sessionId: "s 1" })).toEqual({ kind: "read", activities })
    expect(get).toHaveBeenLastCalledWith("/calls/s%201/activities", expect.anything())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("tells a refusal that stays from a trouble that passes", async () => {
    for (const status of [401, 403, 404, 410]) {
      get.mockRejectedValueOnce(failed(status))
      expect(await readActivities({ sessionId: "s1" })).toEqual({ kind: "refused" })
    }
    get.mockRejectedValueOnce(failed(429))
    expect(await readActivities({ sessionId: "s1" })).toEqual({ kind: "busy" })
    get.mockRejectedValueOnce(failed(503))
    expect(await readActivities({ sessionId: "s1" })).toEqual({ kind: "unreachable" })
    get.mockRejectedValueOnce(new Error("Network Error"))
    expect(await readActivities({ sessionId: "s1" })).toEqual({ kind: "unreachable" })
    get.mockResolvedValueOnce({ status: 200, data: {} })
    expect(await readActivities({ sessionId: "s1" })).toEqual({ kind: "unreachable" })
  })

  it("does one thing and answers the id of what it made", async () => {
    post.mockResolvedValueOnce({ status: 200, data: { data: { id: "p1" } } })
    const poll = { question: "Ship?", options: ["Yes", "No"], multiple: false, anonymous: true, hide_results: false }
    expect(await doActivity({ sessionId: "s1" }, { op: "poll", poll })).toEqual({ ok: true, id: "p1" })
    expect(post).toHaveBeenLastCalledWith("/calls/s1/activities", { op: "poll", poll }, expect.anything())
    post.mockResolvedValueOnce({ status: 200, data: { data: { id: "" } } })
    expect(await doActivity({ sessionId: "s1" }, { op: "vote", id: "p1", options: [] })).toEqual({ ok: true, id: "" })
  })

  it("says why not in the server's words: too fast, gone, or neither", async () => {
    post.mockRejectedValueOnce(failed(429, "Slow down a little."))
    expect(await doActivity({ sessionId: "s1" }, { op: "upvote", id: "q1", on: true })).toEqual({ ok: false, msg: "Slow down a little.", tooFast: true, gone: false })
    post.mockRejectedValueOnce(failed(403, "You're not in this call.", "not_in_call"))
    expect(await doActivity({ sessionId: "s1" }, { op: "ask", text: "Hi?", anonymous: false })).toMatchObject({ ok: false, tooFast: false, gone: true })
    post.mockRejectedValueOnce(failed(403, "Only the people running the call can do that.", "not_allowed"))
    expect(await doActivity({ sessionId: "s1" }, { op: "close_poll", id: "p1" })).toEqual({ ok: false, msg: "Only the people running the call can do that.", tooFast: false, gone: false })
    post.mockRejectedValueOnce(new Error("Network Error"))
    // Nothing answered: the app's own words for an unreachable server.
    expect(await doActivity({ sessionId: "s1" }, { op: "close_poll", id: "p1" })).toEqual({ ok: false, msg: "The server could not be reached. Check your connection and try again in a moment.", tooFast: false, gone: false })
  })
})

describe("a guest's polls and questions", () => {
  it("reads and acts by the call token, never through the signed-in instance", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { data: activities }))
    expect(await readActivities({ callToken: "tok" })).toEqual({ kind: "read", activities })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/guest\/calls\/activities$/)
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })

    fetchMock.mockResolvedValueOnce(answer(200, { data: { id: "q9" } }))
    expect(await doActivity({ callToken: "tok" }, { op: "ask", text: "Is it recorded?", anonymous: true })).toEqual({ ok: true, id: "q9" })
    const [postUrl, postInit] = fetchMock.mock.calls[1]
    expect(String(postUrl)).toMatch(/\/guest\/calls\/activities$/)
    expect(postInit).toMatchObject({ method: "POST", headers: { Authorization: "Bearer tok" } })
    expect(JSON.parse(String((postInit as RequestInit).body))).toEqual({ op: "ask", text: "Is it recorded?", anonymous: true })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it("stops on a token the call no longer takes, and says a busy or unreachable server passes", async () => {
    fetchMock.mockResolvedValueOnce(answer(401, { msg: "You're not in this call." }))
    expect(await readActivities({ callToken: "tok" })).toEqual({ kind: "refused" })
    fetchMock.mockResolvedValueOnce(answer(429, { msg: "Too many requests." }))
    expect(await readActivities({ callToken: "tok" })).toEqual({ kind: "busy" })
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    expect(await readActivities({ callToken: "tok" })).toEqual({ kind: "unreachable" })
    fetchMock.mockResolvedValueOnce(answer(403, { code: "call_over", msg: "This call has ended." }))
    expect(await doActivity({ callToken: "tok" }, { op: "vote", id: "p1", options: ["o1"] })).toMatchObject({ ok: false, gone: true, msg: "This call has ended." })
  })
})
