import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { existsSync, readFileSync } from "node:fs"

vi.mock("next/navigation", () => ({ usePathname: () => "/app/doc/q4-launch-plan", notFound: vi.fn() }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import { AppNotFound, queryFromPath } from "@/components/error/AppNotFound"
import { PALETTE_OPEN_EVENT } from "@/lib/ui/palette"
import NotFoundPage from "@/app/not-found"

// A signed-in person who followed a bad /app link lost the sidebar: the only
// 404 was the signed-out one. Design v3 (shell §L4) draws it inside the shell.
afterEach(cleanup)

describe("a signed-in 404", () => {
  it("is drawn inside the shell, for any /app address no route answers", () => {
    expect(existsSync("app/app/not-found.tsx")).toBe(true)
    expect(readFileSync("app/app/[...missing]/page.tsx", "utf8")).toMatch(/notFound\(\)/)
  })

  it("says the page wandered off, goes home, and searches for what the link named", () => {
    const asked: unknown[] = []
    const listen = (e: Event) => asked.push((e as CustomEvent).detail)
    window.addEventListener(PALETTE_OPEN_EVENT, listen)
    render(<AppNotFound />)
    expect(screen.getByRole("heading", { name: "This page wandered off" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/app/home")
    fireEvent.click(screen.getByRole("button", { name: /Search/ }))
    expect(asked).toEqual([{ query: "q4 launch plan" }])
    expect(document.querySelector("[data-spot-orbit] .orbit-once")).toBeTruthy()
    window.removeEventListener(PALETTE_OPEN_EVENT, listen)
  })

  it("de-slugs the link's last words, and drops a bare id", () => {
    expect(queryFromPath("/app/channel/launch_room")).toBe("launch room")
    expect(queryFromPath("/app/doc/2b8e4c1a-9f0d-4c3e-8a77-0d9e1f2a3b4c")).toBe("")
    expect(queryFromPath("/app/x/caf%C3%A9-notes?tab=1")).toBe("café notes")
  })
})

describe("the signed-out 404", () => {
  it("keeps Sign in, with the orbit spot", () => {
    const view = render(<NotFoundPage />)
    expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy()
    expect(view.container.querySelector("[data-spot-orbit]")).toBeTruthy()
  })
})
