import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A file's bytes from its address, for whatever makes a file from the pictures
// on a page (a board's export, a doc's Word file). A file on the API carries
// the session, so it goes through backendFetch like every credentialed request
// (lib/http/credentialedRequests.test.ts); anyone else's address gets no
// cookies of ours.

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let answer: () => Response | Promise<Response>

beforeEach(() => {
  vi.resetModules()
  calls = []
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://acme-api.onemana.dev/"
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), init })
      return answer()
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

// The page's own Blob, as a browser's answer gives (jsdom's Response makes another realm's).
const file = () => ({ ok: true, blob: async () => new Blob(["hi"], { type: "image/png" }) }) as unknown as Response

describe("fetchFile", () => {
  it("reads a file on the API with the session, as the web app", async () => {
    answer = file
    const { fetchFile } = await import("@/lib/http/fetchFile")
    const blob = await fetchFile("https://acme-api.onemana.dev/board/getBoardAttachment/b1/o1")
    expect(await blob?.text()).toBe("hi")
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://acme-api.onemana.dev/board/getBoardAttachment/b1/o1")
    expect(calls[0].init.credentials).toBe("include")
    expect(new Headers(calls[0].init.headers).get("X-Requested-With")).toBe("XMLHttpRequest")
  })

  it("reads anyone else's address without the session", async () => {
    answer = file
    const { fetchFile } = await import("@/lib/http/fetchFile")
    expect(await (await fetchFile("https://images.example.com/a.png"))?.text()).toBe("hi")
    expect(calls[0].url).toBe("https://images.example.com/a.png")
    expect(calls[0].init.credentials).toBeUndefined()
  })

  it("is nothing for an answer that isn't the file (a 404 page is no picture), or no answer", async () => {
    const { fetchFile } = await import("@/lib/http/fetchFile")
    answer = () => new Response("<html>Not found</html>", { status: 404 })
    expect(await fetchFile("https://acme-api.onemana.dev/board/getBoardAttachment/b1/gone")).toBeNull()
    answer = () => Promise.reject(new TypeError("offline"))
    expect(await fetchFile("https://images.example.com/offline.png")).toBeNull()
  })
})
