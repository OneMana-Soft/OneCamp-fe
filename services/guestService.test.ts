import { afterEach, describe, expect, it, vi } from "vitest"
import { getGuestCollabSession } from "./guestService"

describe("a guest's session from a share link", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("is asked for with the link alone, never with a cookie, whatever origin the API is on (a board's embed sits in another site)", async () => {
    const fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: { collab_token: "jwt" } }), headers: { get: () => null } }))
    vi.stubGlobal("fetch", fetch)
    const res = await getGuestCollabSession("tok")
    expect(res).toEqual({ ok: true, data: { collab_token: "jwt" } })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/guest\/collab\/tok$/)
    expect(init).toMatchObject({ method: "POST", credentials: "omit" })
  })
})
