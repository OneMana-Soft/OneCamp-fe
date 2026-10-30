import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { pinTestClock } from "@/lib/testing/testClock"
import { readCallThread, writeInCallThread } from "./callThreadService"

// The call's chat's requests (CALLS-3b): a member as themselves, a guest by
// the call token they joined with; a poll sends back the last read's latest
// and an empty answer means nothing new.

pinTestClock(new Date("2026-10-22T09:30:00Z"))

const get = axiosInstance.get as unknown as ReturnType<typeof vi.fn>
const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>
const thread = { post: { id: "p1", author: "Maya Chen", text: "Maya Chen started a call", created_at: "2026-10-22T09:10:00Z" }, replies: [], can_reply: true, latest: "2026-10-22T09:10:00Z" }
const failed = (status: number, msg = "", code?: string) => Object.assign(new Error("failed"), { isAxiosError: true, response: { status, data: { msg, code } } })
const fetchMock = vi.fn()

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("a member's chat", () => {
  it("reads the call's chat by the call's id, sending back since", async () => {
    get.mockResolvedValueOnce({ status: 200, data: { data: thread } })
    expect(await readCallThread({ sessionId: "s 1" })).toEqual({ kind: "thread", thread })
    expect(get).toHaveBeenLastCalledWith("/calls/s%201/thread", expect.anything())
    get.mockResolvedValueOnce({ status: 204, data: "" })
    expect(await readCallThread({ sessionId: "s1" }, "2026-10-22T09:10:00.5+05:30")).toEqual({ kind: "unchanged" })
    expect(get).toHaveBeenLastCalledWith("/calls/s1/thread?since=2026-10-22T09%3A10%3A00.5%2B05%3A30", expect.anything())
  })

  it("tells a chat that isn't there from a refusal that stays and a trouble that passes", async () => {
    get.mockRejectedValueOnce(failed(404))
    expect(await readCallThread({ sessionId: "s1" })).toEqual({ kind: "missing" })
    for (const status of [401, 403, 410]) {
      get.mockRejectedValueOnce(failed(status))
      expect(await readCallThread({ sessionId: "s1" })).toEqual({ kind: "refused" })
    }
    get.mockRejectedValueOnce(failed(429))
    expect(await readCallThread({ sessionId: "s1" })).toEqual({ kind: "busy" })
    get.mockRejectedValueOnce(failed(503))
    expect(await readCallThread({ sessionId: "s1" })).toEqual({ kind: "unreachable" })
    get.mockRejectedValueOnce(new Error("Network Error"))
    expect(await readCallThread({ sessionId: "s1" })).toEqual({ kind: "unreachable" })
  })

  it("writes plain text, and says why a write was refused in the server's words", async () => {
    post.mockResolvedValueOnce({ status: 200, data: { msg: "Sent" } })
    expect(await writeInCallThread({ sessionId: "s1" }, "hi")).toEqual({ ok: true })
    expect(post).toHaveBeenLastCalledWith("/calls/s1/thread", { text: "hi" }, expect.anything())
    post.mockRejectedValueOnce(failed(403, "You can read this call's chat, but not write in it."))
    expect(await writeInCallThread({ sessionId: "s1" }, "hi")).toEqual({ ok: false, msg: "You can read this call's chat, but not write in it.", readOnly: true, held: false, gone: false })
    // The people running the call hold its chat (meet-12): held, not read-only, so the field comes back when they let everyone again.
    post.mockRejectedValueOnce(failed(403, "The people running the call have turned off chat for now.", "chat_held"))
    expect(await writeInCallThread({ sessionId: "s1" }, "hi")).toMatchObject({ ok: false, readOnly: false, held: true, gone: false })
    post.mockRejectedValueOnce(failed(404, "This call's chat isn't here. The call may have ended."))
    expect(await writeInCallThread({ sessionId: "s1" }, "hi")).toMatchObject({ ok: false, readOnly: false, gone: true })
  })
})

describe("a guest's chat", () => {
  const answer = (status: number, body?: unknown) => ({ ok: status < 300, status, json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body), headers: { get: () => null } })

  it("reads by the call token, never through the signed-in instance", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { data: thread }))
    expect(await readCallThread({ callToken: "tok" }, "2026-10-22T09:10:00Z")).toEqual({ kind: "thread", thread })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/guest\/calls\/thread\?since=2026-10-22T09%3A10%3A00Z$/)
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer tok" })
    expect(get).not.toHaveBeenCalled()
    fetchMock.mockResolvedValueOnce(answer(204))
    expect(await readCallThread({ callToken: "tok" }, "x")).toEqual({ kind: "unchanged" })
    fetchMock.mockResolvedValueOnce(answer(404, { msg: "gone" }))
    expect(await readCallThread({ callToken: "tok" })).toEqual({ kind: "missing" })
    // A call token refused is refused for good, never "retrying".
    fetchMock.mockResolvedValueOnce(answer(401, { msg: "Not a call token" }))
    expect(await readCallThread({ callToken: "tok" })).toEqual({ kind: "refused" })
    fetchMock.mockResolvedValueOnce(answer(429, { msg: "Too many" }))
    expect(await readCallThread({ callToken: "tok" })).toEqual({ kind: "busy" })
  })

  it("writes by the call token and passes on why not", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { msg: "Sent" }))
    expect(await writeInCallThread({ callToken: "tok" }, "hello")).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).method).toBe("POST")
    expect((init as RequestInit).body).toBe(JSON.stringify({ text: "hello" }))
    fetchMock.mockResolvedValueOnce(answer(403, { msg: "You can read this call's chat, but not write in it.", code: "read_only" }))
    expect(await writeInCallThread({ callToken: "tok" }, "hello")).toMatchObject({ ok: false, readOnly: true, held: false })
    fetchMock.mockResolvedValueOnce(answer(403, { msg: "The people running the call have turned off chat for now.", code: "chat_held" }))
    expect(await writeInCallThread({ callToken: "tok" }, "hello")).toMatchObject({ ok: false, readOnly: false, held: true })
    fetchMock.mockResolvedValueOnce(answer(429, { msg: "Too many messages from here." }))
    expect(await writeInCallThread({ callToken: "tok" }, "hello")).toMatchObject({ ok: false, msg: "Too many requests, wait a minute and try again." })
  })
})
