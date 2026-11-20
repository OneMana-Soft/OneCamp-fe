import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runRefresh } from "@/lib/auth/sessionRefreshRun"

// V-1086 (live since ~17 Oct): axios's fetch adapter wrote "User-Agent:
// axios/<version>" on every request it sent. Chromium drops it; Firefox sends
// it, so the CORS preflight asked for user-agent, which the API's allowed
// headers don't list, and on Firefox every session refresh was refused: people
// were signed out when their access token ran out. These drive axios's REAL
// fetch adapter; only fetch itself is stubbed. The keywords save, the other
// request it sends, is held to the same in keywordsAndVipsCard.test.
const fetchStub = vi.fn<(req: Request, opts?: RequestInit) => Promise<Response>>(async () => Response.json({}))

beforeEach(() => {
  fetchStub.mockClear()
  vi.stubGlobal("fetch", fetchStub)
  vi.stubEnv("NEXT_PUBLIC_BACKEND_URL", "http://api.test/")
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("a request through the fetch adapter", () => {
  it("sends the session refresh with no User-Agent for a preflight to ask about", async () => {
    const clock = { knew: 0, kept: () => null, fresh: () => false, adopt: vi.fn(), keep: vi.fn(), forget: vi.fn() }
    await runRefresh(clock)
    expect(fetchStub).toHaveBeenCalledTimes(1)
    const [req] = fetchStub.mock.calls[0]
    expect(req.url).toBe("http://api.test/refreshToken")
    expect(req.headers.get("user-agent")).toBeNull()
    expect(clock.keep).toHaveBeenCalled()
  })
})
