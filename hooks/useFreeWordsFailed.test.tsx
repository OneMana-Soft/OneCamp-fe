import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useFreeWords } from "@/hooks/useFreeWords"
import { CHUNK_RECOVERY_SCRIPT } from "@/lib/chunkRecoveryScript"

// A filtered search's list waits for its words (app/app/search/page.tsx), and
// the words for the grammar, a chunk of its own. When the chunk can't come
// (offline), the words are none, so nothing waits for them for ever. After a
// deploy the old chunk is gone for good, and the page reloads once onto the
// new build. One hook per case: vitest hands a second import of a module
// whose mock is still being made the real module, where a browser's second
// import shares the first one's failure.
vi.mock("@/lib/search/query", () => {
  throw new Error("Loading chunk lib/search/query failed")
})

const reload = vi.fn()
let offline: MockInstance | undefined

afterEach(() => {
  offline?.mockRestore()
  offline = undefined
  vi.unstubAllGlobals()
  delete window.__ocChunk
  reload.mockReset()
  sessionStorage.clear()
})

describe("a search whose grammar can't load", () => {
  it("has no free words offline, so its results don't wait for them, and the page stays", async () => {
    vi.stubGlobal("location", { reload })
    new Function(CHUNK_RECOVERY_SCRIPT)()
    offline = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false)
    const { result } = renderHook(() => useFreeWords("launch plan from:@sam"))
    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toBe(""))
    expect(reload).not.toHaveBeenCalled()
  })

  it("reloads the page once after a deploy, onto the new build's code, when the server says the old chunk is gone", async () => {
    vi.stubGlobal("location", { reload })
    const probe = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal("fetch", probe)
    new Function(CHUNK_RECOVERY_SCRIPT)()
    // vitest's wrapper hides the file the failure names, as it hides the words (above).
    window.__ocChunk!.urlOf = () => "/_next/static/chunks/searchQuery.js"
    renderHook(() => useFreeWords("launch plan from:@sam"))
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1))
    expect(probe).toHaveBeenCalledWith("/_next/static/chunks/searchQuery.js", expect.objectContaining({ method: "HEAD" }))
  })
})
