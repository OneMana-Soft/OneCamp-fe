import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The settings pages that depend on a permission. Each opens with its
// section's header at once and holds its place until the answer is in. A
// member without the permission is told who can change that and where: the
// workflows page sent them to "Settings → Permissions", which does not exist;
// Permissions is under Admin.

const { caps, ai } = vi.hoisted(() => ({ caps: { isLoading: false, granted: true }, ai: { state: "available" as string } }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: caps.isLoading }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => ai.state, useAIAvailable: () => ai.state === "available" }))
vi.mock("@/components/admin/WorkflowsCard", () => ({ default: ({ hue }: { hue?: string }) => <div data-testid="workflows-card" data-hue={hue} /> }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import WorkflowsSettingsPage from "./workflows/page"
import { settingsSection } from "@/lib/settingsSections"

beforeEach(() => {
  caps.isLoading = false
  caps.granted = true
  ai.state = "available"
})
afterEach(cleanup)

const h1 = () => screen.getByRole("heading", { level: 1 })

describe("workflows", () => {
  it("opens with its header and holds its place while permissions load", () => {
    caps.isLoading = true
    render(<WorkflowsSettingsPage />)
    expect(h1()).toHaveAccessibleName("Workflows")
    expect(screen.getByRole("status", { name: "Loading workflows" })).toBeInTheDocument()
    expect(screen.queryByText(/turned off/)).toBeNull()
  })

  it("tells a member without the permission where an admin turns it on", () => {
    caps.granted = false
    render(<WorkflowsSettingsPage />)
    expect(screen.getByText(/Admin, Permissions/)).toBeInTheDocument()
    expect(screen.queryByText(/Settings →/)).toBeNull()
    expect(screen.queryByTestId("workflows-card")).toBeNull()
  })

  it("shows the workflows in the section's own hue", () => {
    render(<WorkflowsSettingsPage />)
    expect(screen.getByTestId("workflows-card")).toHaveAttribute("data-hue", "ink")
  })
})

describe("API tokens", () => {
  // The page is imported once, before the tests, with time of its own: its first import
  // transforms the whole page, which on a loaded machine (CI on Node 22.23.4, 22 Oct) took
  // longer than a test's 5 s by itself. The tests then wait on what they check.
  let ApiTokensSettingsPage: (typeof import("./api-tokens/page"))["default"]
  beforeAll(async () => {
    ApiTokensSettingsPage = (await import("./api-tokens/page")).default
  }, 60_000)

  it("puts New token, the page's one primary action, in its header, and it opens the dialog", async () => {
    render(<ApiTokensSettingsPage />)
    const header = screen.getByRole("banner")
    expect(h1()).toHaveAccessibleName("API tokens")
    fireEvent.click(within(header).getByRole("button", { name: "New token" }))
    // The dialog may come in its own chunk: waited for, not read at the default second.
    expect(await screen.findByRole("dialog", {}, { timeout: 10_000 })).toBeInTheDocument()
  }, 20_000)

  // One height for a header's action across the settings pages and the admin
  // sections: New token was 36px where Admin's actions are 32px.
  it("draws New token at the section actions' height", async () => {
    render(<ApiTokensSettingsPage />)
    const button = within(screen.getByRole("banner")).getByRole("button", { name: "New token" })
    expect(button.className).toContain("md:h-8")
    expect(button.className).toContain("h-11")
  })

  // A token never carries its owner's admin powers (helpers.ActsThroughToken
  // on the server, since 17 Oct); the page and the settings list said "act as you".
  it("says a token acts with a member's powers, never an admin's, here and in the settings list", () => {
    render(<ApiTokensSettingsPage />)
    expect(within(screen.getByRole("banner")).getByText(/acts as you with a member's powers, never an admin's/)).toBeInTheDocument()
    expect(settingsSection("/app/settings/api-tokens")?.description).toMatch(/with a member's powers/)
  })
})
