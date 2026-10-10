import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// /app/team draws the list of teams itself only where the sidebar does not
// show it: a phone, and a tablet, whose sidebar starts as a rail of icons
// below 1024 (lib/ui/sidebarSize). On a tablet the page was empty.

const media = { isMobile: false, isTablet: false, isDesktop: true }
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media }))
vi.mock("@/components/team/TeamList", () => ({ TeamList: () => <p>team list</p> }))

import TeamHomePage from "./page"

afterEach(() => cleanup())

describe("the teams page", () => {
  it("lists the teams on a tablet, where the sidebar is a rail", () => {
    Object.assign(media, { isMobile: false, isTablet: true, isDesktop: true })
    render(<TeamHomePage />)
    expect(screen.getByText("team list")).toBeTruthy()
  })

  it("lists them on a phone", () => {
    Object.assign(media, { isMobile: true, isTablet: false, isDesktop: false })
    render(<TeamHomePage />)
    expect(screen.getByText("team list")).toBeTruthy()
  })

  it("leaves them to the sidebar on a wide screen", () => {
    Object.assign(media, { isMobile: false, isTablet: false, isDesktop: true })
    render(<TeamHomePage />)
    expect(screen.queryByText("team list")).toBeNull()
  })
})
