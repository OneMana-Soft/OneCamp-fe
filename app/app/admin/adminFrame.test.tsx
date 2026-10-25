import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The admin page's frame (design v3, admin §1.1 and §1.2). The sections are in
// the settings nav that takes the sidebar's place, so the page has no menu of
// its own: it shows the section its ?tab= names under that section's header
// (one 36px tile, the name as the h1, one line). On a phone with no section
// asked for, it is the list of sections.

const media = vi.hoisted(() => ({ value: { isMobile: false, isTablet: false, isDesktop: true } }))
const features = vi.hoisted(() => ({ value: { ai: "available", calls: "available" } as Record<string, string> }))
const params = vi.hoisted(() => ({ value: new URLSearchParams() }))

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media.value }))
vi.mock("next/navigation", () => ({ useSearchParams: () => params.value }))
vi.mock("@/hooks/useClientConfig", () => ({
  FEATURE_AI: "ai",
  FEATURE_CALLS: "calls",
  useFeatureState: (name: string) => features.value[name],
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true, isLoading: false }) }))
vi.mock("@/components/admin/userCard", () => ({ default: () => <p>Members list</p> }))
// Every other section's cards load lazily; here they are a stub.
vi.mock("next/dynamic", () => ({ default: () => () => <p>A section</p> }))
// The Import tab's review of who earlier imports added: none to draw.
vi.mock("@/lib/importReviews", () => ({ useImportReviewPlace: () => "none" }))

const { default: AdminPage } = await import("./page")

afterEach(() => {
  cleanup()
  media.value = { isMobile: false, isTablet: false, isDesktop: true }
  features.value = { ai: "available", calls: "available" }
  params.value = new URLSearchParams()
})

describe("the admin page's frame", () => {
  it("has no section menu in the page: the settings nav holds it", () => {
    render(<AdminPage />)
    expect(screen.queryByRole("tablist")).toBeNull()
    expect(screen.queryByRole("combobox", { name: "Admin section" })).toBeNull()
  })

  it("opens a section under its own header: one 36px tile and its name as the h1", () => {
    params.value = new URLSearchParams("tab=settings")
    const { container } = render(<AdminPage />)
    expect(screen.getByRole("heading", { level: 1, name: "General" })).toBeTruthy()
    expect(container.querySelectorAll("[data-page-tile]")).toHaveLength(1)
    expect(screen.getByText("Uploads, who can join, and where new people start.")).toBeTruthy()
  })

  it("opens on Members when no section is asked for", () => {
    render(<AdminPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Members" })).toBeTruthy()
    expect(screen.getByText("Members list")).toBeTruthy()
  })

  it("gives the members table, the audit log and the invitations the wide frame, and General the narrow one", () => {
    params.value = new URLSearchParams("tab=audit")
    const { container } = render(<AdminPage />)
    expect(container.querySelector("[data-page-frame]")?.getAttribute("data-page-frame")).toBe("wide")
    cleanup()
    params.value = new URLSearchParams("tab=settings")
    const again = render(<AdminPage />)
    expect(again.container.querySelector("[data-page-frame]")?.getAttribute("data-page-frame")).toBe("narrow")
  })

  it("is the list of sections on a phone when none is asked for", () => {
    media.value = { isMobile: true, isTablet: false, isDesktop: false }
    render(<AdminPage />)
    expect(screen.getByRole("link", { name: /General/ })).toBeTruthy()
    expect(screen.getByRole("link", { name: /Health and updates/ })).toBeTruthy()
    expect(screen.queryByText("Members list")).toBeNull()
  })

  it("opens the asked-for section on a phone, its title for screen readers under the top bar", () => {
    media.value = { isMobile: true, isTablet: false, isDesktop: false }
    params.value = new URLSearchParams("tab=users")
    render(<AdminPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Members" }).className).toContain("max-sm:sr-only")
  })

  it("holds a deep link to a gated section in its skeleton until the server answers", () => {
    features.value = { ai: "unknown", calls: "available" }
    params.value = new URLSearchParams("tab=ai-models")
    render(<AdminPage />)
    expect(screen.getByRole("status", { name: "Loading this section" })).toBeTruthy()
    expect(screen.queryByText("Members list")).toBeNull()
  })

  it("falls back to Members for a section the server doesn't have", () => {
    features.value = { ai: "unavailable", calls: "available" }
    params.value = new URLSearchParams("tab=ai-models")
    render(<AdminPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Members" })).toBeTruthy()
  })

  it("still resolves the old addresses", () => {
    params.value = new URLSearchParams("tab=slack-import")
    render(<AdminPage />)
    expect(screen.getByRole("heading", { level: 1, name: "Import and export" })).toBeTruthy()
  })

  // A long section's jumps: in the header below 1280px, a rail beside the
  // column from 1280px (OnThisPageRail). AI & agents has none: its sub-page
  // tab bar is its navigation (aiAgentsTabs.test.tsx), so this reads General.
  it("offers a long section's jumps, and none on a short one", () => {
    params.value = new URLSearchParams("tab=settings")
    render(<AdminPage />)
    expect(screen.getByRole("button", { name: /on this page/i })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "On this page" })).toBeTruthy()
    cleanup()
    params.value = new URLSearchParams("tab=users")
    render(<AdminPage />)
    expect(screen.queryByRole("button", { name: /on this page/i })).toBeNull()
    cleanup()
    params.value = new URLSearchParams("tab=ai-models")
    render(<AdminPage />)
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull()
  })
})

describe("the people tabs while their code loads", () => {
  // They waited as AdminCardSkeleton's generic four rows and a button bar,
  // then drew their own frame, then their rows: two jumps.
  it("wait in the people frame's own shape", async () => {
    const { readFileSync } = await import("node:fs")
    const { join } = await import("node:path")
    const page = readFileSync(join(process.cwd(), "app/app/admin/page.tsx"), "utf8")
    for (const card of ["teamCard", "adminCard", "invitationCard", "ExternalUsersCard"]) {
      const line = page.split("\n").find((l) => l.includes(`import("@/components/admin/${card}")`)) ?? ""
      expect(line, card).toMatch(/PeopleTabSkeleton/)
    }
  })
})
