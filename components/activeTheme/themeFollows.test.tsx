import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { SWRConfig } from "swr"

// A member's theme follows them to every device: the saved one is applied from
// the profile the signed-in app already holds, and a change is saved to it.
// Both waited for checkAuthCookieExists(), which reads the session's cookie
// from document.cookie, where JS can never see it (it is HttpOnly), so the
// theme was never read and never saved.
//
// The real ThemeSync and its backend sync, under a real SWR cache holding the
// profile as the app's own read leaves it. The mode (next-themes) and the
// write (usePost) are the test's.

const state: { mode: string | undefined } = { mode: "light" }
const setTheme = vi.fn((m: string) => {
  state.mode = m
})
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: state.mode, setTheme }) }))
const posts: { apiEndpoint?: string; payload?: unknown }[] = []
// A save the server refuses (an e2e stub's 404, a server that's down).
let failing = false
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    makeRequest: async (req: { apiEndpoint?: string; payload?: unknown }) => {
      posts.push(req)
      if (failing) throw new Error("Request failed with status code 404")
    },
  }),
}))

const saved = (color: string, mode: string) => ({ data: { user_uuid: "u-1", user_theme_color: color, user_theme_mode: mode } })

// Loaded once before any test's clock runs (V-61, lib/testing/inTestImportsGuard): the fresh copy
// each test imports then only runs it again, without transforming its graph inside the test's 5 s.
beforeAll(async () => {
  await import("@/components/activeTheme/ThemeSync")
})

async function mount(profile?: unknown) {
  const { ActiveThemeProvider, useThemeConfig } = await import("@/components/activeTheme/activeTheme")
  const { ThemeSync } = await import("@/components/activeTheme/ThemeSync")
  const cache = new Map<string, unknown>()
  if (profile) cache.set("/user/profile", { data: profile })
  const seen: { color?: string } = {}
  function Probe() {
    seen.color = useThemeConfig().activeTheme
    return null
  }
  const tree = () => (
    <SWRConfig value={{ provider: () => cache as never }}>
      <ActiveThemeProvider>
        <ThemeSync />
        <Probe />
      </ActiveThemeProvider>
    </SWRConfig>
  )
  const view = render(tree())
  return { seen, rerender: () => view.rerender(tree()) }
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  state.mode = "light"
  setTheme.mockClear()
  posts.length = 0
  failing = false
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.resetModules()
})

describe("a member's theme", () => {
  it("is applied from the profile the signed-in app holds", async () => {
    const { seen } = await mount(saved("green", "dark"))
    await settle()
    expect(seen.color).toBe("green")
    expect(setTheme).toHaveBeenCalledWith("dark")
  })

  it("is saved to the profile when they change it", async () => {
    const { rerender } = await mount(saved("green", "light"))
    await settle()
    state.mode = "dark"
    rerender()
    await settle()
    expect(posts).toContainEqual(expect.objectContaining({ apiEndpoint: "/updateUserTheme", payload: { user_theme_color: "green", user_theme_mode: "dark" } }))
  })

  it("isn't saved back when it was only applied from the profile", async () => {
    await mount(saved("green", "dark"))
    await settle()
    expect(posts).toEqual([])
  })

  // A refused save was sent again on every render: each try flipped usePost's isSubmitting,
  // which gave the effect a new `post`, and the rate limit counted successes only, so it was
  // sent again at once, about ten times a second (718 POSTs in one e2e file, 22 Oct).
  it("isn't sent again and again when the server refuses it", async () => {
    failing = true
    const { rerender } = await mount(saved("green", "light"))
    await settle()
    state.mode = "dark"
    rerender()
    await settle()
    for (let i = 0; i < 5; i++) {
      rerender()
      await settle()
    }
    expect(posts.filter((p) => p.apiEndpoint === "/updateUserTheme")).toHaveLength(1)
    // ...and quietly: showToast: false keeps only the success toast away; the client's
    // error toast (a 404's "Not found") is kept away by quiet.
    expect(posts[0]).toMatchObject({ quiet: true })
  })

  it("is neither read nor saved where nobody is signed in", async () => {
    const { seen, rerender } = await mount()
    await settle()
    state.mode = "dark"
    rerender()
    await settle()
    expect(posts).toEqual([])
    expect(seen.color).toBe("onecamp")
  })
})
