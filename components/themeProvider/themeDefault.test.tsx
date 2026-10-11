import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

import { ThemeProvider } from "@/components/themeProvider/theme-provider"

// New accounts and signed-out visitors start on System (owner's decision,
// 11 Oct 2026): the app follows the OS for light and dark, where it defaulted
// to light and a dark-OS visitor never saw dark. A choice the person made
// (saved in ui-theme, or on their profile through ThemeSync) still wins. On the
// demo, ThemeSync never applies the shared account's saved mode, so every
// visitor starts on System too.

const root = join(__dirname, "..", "..")
const read = (f: string) => readFileSync(join(root, f), "utf8")

function osPrefersDark(dark: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.className = ""
})
afterEach(cleanup)

describe("the starting theme", () => {
  it("is System in the provider and in the app's providers", () => {
    expect(read("components/themeProvider/theme-provider.tsx")).toMatch(/defaultTheme="system"/)
    expect(read("components/themeProvider/theme-provider.tsx")).toMatch(/enableSystem/)
    expect(read("components/providers/ClientProviders.tsx")).toMatch(/<ThemeProvider defaultTheme="system" storageKey="ui-theme">/)
    expect(read("components/providers/ClientProviders.tsx")).not.toMatch(/defaultTheme="light"/)
  })

  it("follows a dark OS when nobody has chosen", async () => {
    osPrefersDark(true)
    await act(async () => {
      render(<ThemeProvider storageKey="ui-theme"><span /></ThemeProvider>)
    })
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("follows a light OS when nobody has chosen", async () => {
    osPrefersDark(false)
    await act(async () => {
      render(<ThemeProvider storageKey="ui-theme"><span /></ThemeProvider>)
    })
    expect(document.documentElement.classList.contains("light")).toBe(true)
  })

  it("keeps a choice the person made over the OS", async () => {
    osPrefersDark(true)
    localStorage.setItem("ui-theme", "light")
    await act(async () => {
      render(<ThemeProvider storageKey="ui-theme"><span /></ThemeProvider>)
    })
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })

  it("never applies the shared demo account's saved mode", () => {
    const sync = read("components/activeTheme/ThemeSync.tsx")
    expect(sync).toMatch(/const shouldFetch = !DEMO && checkAuthCookieExists\(\)/)
    expect(read("components/activeTheme/useThemeBackendSync.ts")).toMatch(/NEXT_PUBLIC_DEMO_MODE === "true"/)
  })
})
