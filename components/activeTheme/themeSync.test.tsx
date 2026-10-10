import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// ThemeSync inside the real ActiveThemeProvider, with the mode (next-themes)
// and the fetched profile under the test's control.

const state: { mode: string | undefined; profile: unknown } = { mode: "light", profile: undefined }
const setTheme = vi.fn((m: string) => {
  state.mode = m
})
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: state.mode, setTheme }) }))
const fetchedKeys: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (key: string) => {
    fetchedKeys.push(key)
    return { data: key ? state.profile : undefined }
  },
}))
vi.mock("@/lib/utils/helpers/getCookie", () => ({ checkAuthCookieExists: () => true }))
vi.mock("@/components/activeTheme/useThemeBackendSync", () => ({ useThemeBackendSync: () => {} }))

const saved = (color: string, mode: string) => ({ data: { user_theme_color: color, user_theme_mode: mode } })

async function mount() {
  const { ActiveThemeProvider, useThemeConfig } = await import("@/components/activeTheme/activeTheme")
  const { ThemeSync } = await import("@/components/activeTheme/ThemeSync")
  const seen: { color?: string; pick?: (c: string) => void } = {}
  function Probe() {
    const { activeTheme, setActiveTheme } = useThemeConfig()
    seen.color = activeTheme
    seen.pick = setActiveTheme
    return null
  }
  const tree = () => (
    <ActiveThemeProvider>
      <ThemeSync />
      <Probe />
    </ActiveThemeProvider>
  )
  const view = render(tree())
  return { seen, rerender: () => view.rerender(tree()) }
}

beforeEach(() => {
  state.mode = "light"
  state.profile = undefined
  setTheme.mockClear()
  fetchedKeys.length = 0
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("the saved theme", () => {
  it("is applied once, and a later change of mode keeps the colour and the mode", async () => {
    state.profile = saved("green", "light")
    const { seen, rerender } = await mount()
    expect(seen.color).toBe("green")
    const calls = setTheme.mock.calls.length

    // Switching to dark used to be put back to the saved "light" at once.
    state.mode = "dark"
    rerender()
    expect(setTheme.mock.calls.length).toBe(calls)
    expect(seen.color).toBe("green")

    // A new colour, then a change of mode: the colour used to go back to green.
    act(() => seen.pick!("blue"))
    state.mode = "light"
    rerender()
    expect(seen.color).toBe("blue")
  })

  it("does not undo a colour picked before it arrived", async () => {
    const { seen, rerender } = await mount()
    act(() => seen.pick!("violet"))
    state.profile = saved("green", "light")
    rerender()
    expect(seen.color).toBe("violet")
  })

  it("is neither read nor applied on the demo, whose account every visitor shares", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    vi.resetModules()
    state.profile = saved("green", "dark")
    const { seen } = await mount()
    expect(fetchedKeys.every((k) => k === "")).toBe(true)
    expect(seen.color).toBe("onecamp")
    expect(setTheme).not.toHaveBeenCalled()
  })
})
