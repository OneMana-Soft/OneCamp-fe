import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: vi.fn(), post: vi.fn() },
}))

import axiosInstance from "@/lib/axiosInstance"
import { breakoutToken, chooseBreakout } from "./callBreakoutsService"

// A breakout room's token (calls package C): a member asks as themselves, a
// guest by the call token they joined with, never through the signed-in
// instance; a refusal is said in the server's words. A guest has no choice
// to tell the server: only a member's choice is an act.

const post = axiosInstance.post as unknown as ReturnType<typeof vi.fn>
const failed = (status: number, msg = "", code?: string) => Object.assign(new Error("failed"), { isAxiosError: true, response: { status, data: { msg, code } } })
const answer = (status: number, body?: unknown) => ({ ok: status < 300, status, json: async () => (body === undefined ? Promise.reject(new Error("no body")) : body), headers: { get: () => null } })
const fetchMock = vi.fn()

beforeEach(() => {
  post.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

describe("a breakout room's token", () => {
  it("a member asks for it as themselves, with the call's language", async () => {
    post.mockResolvedValueOnce({ data: { data: { token: "t2", room: "r", session: "s1", number: 2, name: "Launch" } } })
    expect(await breakoutToken({ sessionId: "s1" }, 2, "de")).toEqual({ ok: true, token: "t2", n: 2, name: "Launch" })
    expect(post.mock.calls[0][0]).toBe("/calls/s1/breakout-token")
    expect(post.mock.calls[0][1]).toEqual({ room: 2, language: "de" })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("says a member's refusal in the server's words", async () => {
    post.mockRejectedValueOnce(failed(403, "That isn't your room. Whoever runs the call can move you, or you can go back to the main room.", "not_your_room"))
    expect(await breakoutToken({ sessionId: "s1" }, 1)).toEqual({ ok: false, msg: "That isn't your room. Whoever runs the call can move you, or you can go back to the main room." })
  })

  it("a guest asks by the call token they joined with, never through the signed-in instance", async () => {
    fetchMock.mockResolvedValueOnce(answer(200, { data: { token: "g1", number: 1, name: "Design" } }))
    expect(await breakoutToken({ callToken: "guest-tok" }, 1)).toEqual({ ok: true, token: "g1", n: 1, name: "Design" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/guest\/calls\/breakout-token$/)
    expect(init).toMatchObject({ method: "POST", headers: { Authorization: "Bearer guest-tok" } })
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ room: 1, language: "" })
    expect(post).not.toHaveBeenCalled()
  })

  it("an answer with no token opens no room", async () => {
    post.mockResolvedValueOnce({ data: { data: {} } })
    expect((await breakoutToken({ sessionId: "s1" }, 1)).ok).toBe(false)
  })
})

describe("a member's choice of room", () => {
  it("is the call's own act; a guest's is never sent", async () => {
    post.mockResolvedValueOnce({ data: { data: { affected: 1 } } })
    expect(await chooseBreakout({ sessionId: "s1" }, 2)).toBe(true)
    expect(post.mock.calls[0]).toEqual(["/calls/s1/act", { action: "breakout_choose", room: 2 }, expect.anything()])
    post.mockRejectedValueOnce(failed(409, "The rooms aren't open.", "rooms_closed"))
    expect(await chooseBreakout({ sessionId: "s1" }, 1)).toBe(false)
    expect(await chooseBreakout({ callToken: "guest-tok" }, 1)).toBe(false)
    expect(post).toHaveBeenCalledTimes(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
