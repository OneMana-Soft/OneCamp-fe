import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The admin page's frame at every width: the side menu only where it fits
// beside the content (lg up), the platform's select below that, and the menu
// always drawn, holding a gated section's place until the server says whether
// it has the subsystem behind it.

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
vi.mock("@/components/admin/userCard", () => ({ default: () => <p>Members list</p> }))
// Every other section's cards load lazily; here they are a stub.
vi.mock("next/dynamic", () => ({ default: () => () => <p>A section</p> }))

const { default: AdminPage } = await import("./page")

afterEach(() => {
  cleanup()
  media.value = { isMobile: false, isTablet: false, isDesktop: true }
  features.value = { ai: "available", calls: "available" }
  params.value = new URLSearchParams()
})

describe("the admin page's frame", () => {
  it("puts the section menu beside the content from lg up", () => {
    render(<AdminPage />)
    expect(screen.getByRole("tablist", { name: "Admin sections" })).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Admin section" })).toBeNull()
  })

  // 640 to 1023px: the 920px menu stacked above every tab, the first member at
  // y 1090, and pinned over the content as it scrolled.
  it("uses the platform's select on a tablet or a half-width window, under the page's header", () => {
    media.value = { isMobile: false, isTablet: true, isDesktop: true }
    render(<AdminPage />)
    expect(screen.queryByRole("tablist", { name: "Admin sections" })).toBeNull()
    expect(screen.getByRole("combobox", { name: "Admin section" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Admin" })).toBeTruthy()
  })

  it("uses the select on a phone, without the header its top bar already gives", () => {
    media.value = { isMobile: true, isTablet: false, isDesktop: false }
    render(<AdminPage />)
    expect(screen.getByRole("combobox", { name: "Admin section" })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 1, name: "Admin" })).toBeNull()
  })

  // The two gated sections joined the menu only when the config answered,
  // pushing Connections and System 72px down; a deep link drew no menu at all.
  it("holds a gated section's place in the menu until the server answers", () => {
    features.value = { ai: "unknown", calls: "unknown" }
    const { container } = render(<AdminPage />)
    expect(container.querySelectorAll("[data-menu-placeholder]")).toHaveLength(2)
    expect(screen.queryByRole("tab", { name: /AI & agents/ })).toBeNull()
    expect(screen.getByRole("tab", { name: /Webhooks/ })).toBeTruthy()
  })

  it("draws the menu for a deep link to a gated section while it waits, with the section's skeleton and nothing marked", () => {
    features.value = { ai: "unknown", calls: "available" }
    params.value = new URLSearchParams("tab=ai-models")
    render(<AdminPage />)
    expect(screen.getByRole("tablist", { name: "Admin sections" })).toBeTruthy()
    expect(screen.getByRole("status", { name: "Loading this section" })).toBeTruthy()
    expect(screen.queryByText("Members list")).toBeNull()
    expect(screen.queryAllByRole("tab", { selected: true })).toHaveLength(0)
  })

  it("lists a gated section in the select, unchosen, until the server answers", () => {
    media.value = { isMobile: true, isTablet: false, isDesktop: false }
    features.value = { ai: "unknown", calls: "available" }
    render(<AdminPage />)
    const option = screen.getByRole("option", { name: "AI & agents" }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
  })

  it("drops a section the server doesn't have", () => {
    features.value = { ai: "unavailable", calls: "available" }
    const { container } = render(<AdminPage />)
    expect(container.querySelectorAll("[data-menu-placeholder]")).toHaveLength(0)
    expect(screen.queryByRole("tab", { name: /AI & agents/ })).toBeNull()
  })

  // The jumps were a row at the top of AI & agents, so its first title sat 52px
  // lower than every other tab's.
  it("offers a long section's jumps in the header, not in the content", () => {
    params.value = new URLSearchParams("tab=ai-models")
    render(<AdminPage />)
    expect(screen.getByRole("button", { name: /on this page/i })).toBeTruthy()
    cleanup()
    params.value = new URLSearchParams("tab=users")
    render(<AdminPage />)
    expect(screen.queryByRole("button", { name: /on this page/i })).toBeNull()
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
