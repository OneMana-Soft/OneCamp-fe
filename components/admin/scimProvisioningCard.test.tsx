import { afterEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Directory provisioning. Credentials are rows of one card (they were a card
// each), dates read in the app's one format, a missing name is said under the
// field instead of in a toast, and expiry is one choice of three as radios.
// Design v3 (admin A8): a credential's tile is a neutral glyph on sunken, not
// a hue (a category is not identity); the endpoint is a code row; a new token
// is shown once in a reveal card with a sun ring; on the free plan the lock
// notice sits inside the card, in the controls' place.

const state = vi.hoisted(() => ({ tokens: [] as unknown[], loading: false, locked: false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () =>
    state.loading
      ? { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
      : { data: { data: { tokens: state.tokens } }, isLoading: false, isError: undefined, mutate: vi.fn() },
}))
vi.mock("@/hooks/usePlan", () => ({ usePlan: () => ({ isLocked: () => state.locked, upgradeUrl: "https://onemana.dev/pricing" }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const create = vi.hoisted(() => vi.fn())
vi.mock("@/services/scimTokenService", async (orig) => ({
  ...(await orig<typeof import("@/services/scimTokenService")>()),
  createScimToken: create,
  revokeScimToken: vi.fn(),
  scimBaseUrl: () => "https://api.kestrel.example/scim/v2",
}))

const { default: ScimProvisioningCard } = await import("./ScimProvisioningCard")

const token = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, token_prefix: "scim_ab12", created_at: "2026-09-01T10:00:00Z", last_used_at: "2026-10-10T08:42:00Z", expires_at: null, revoked_at: null, ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.tokens = []
  state.loading = false
  state.locked = false
})
// Today is pinned (app/testClock.test.ts): a credential's last use is written without its year in its year, and one that ran out on 1 January 2026 has expired.
pinTestClock()

describe("directory provisioning", () => {
  it("lists credentials as rows of one card, with dates in the app's format", () => {
    state.tokens = [token("t1", "Okta production"), token("t2", "Azure staging", { last_used_at: null })]
    render(<ScimProvisioningCard />)
    const row = screen.getByText("Okta production").closest("li")!
    expect(row.className).toContain("set-row")
    expect(row.closest("[data-settings-card]")).toBeTruthy()
    expect(within(row).getByText(/^Last used \d{1,2} Oct, \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy()
    // A category's tile: neutral, never a hue.
    expect(row.querySelector("[class*='hue-']")).toBeNull()
    expect(row.querySelector(".bg-sunken svg")).toBeTruthy()
  })

  it("says a missing name under the field, and sends nothing", async () => {
    render(<ScimProvisioningCard />)
    fireEvent.click(screen.getByRole("button", { name: "New credential" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create credential" })))
    expect(create).not.toHaveBeenCalled()
    const name = screen.getByLabelText("Name")
    expect(name.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert").textContent).toMatch(/Give the credential a name/)
    expect(document.activeElement).toBe(name)
  })

  it("offers expiry as one choice of three", () => {
    render(<ScimProvisioningCard />)
    fireEvent.click(screen.getByRole("button", { name: "New credential" }))
    const group = screen.getByRole("radiogroup", { name: "Expiry" })
    expect(within(group).getAllByRole("radio")).toHaveLength(3)
    expect(within(group).getByRole("radio", { name: "No expiry" }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(within(group).getByRole("radio", { name: "1 year" }))
    expect(within(group).getByRole("radio", { name: "1 year" }).getAttribute("aria-checked")).toBe("true")
  })

  it("shows a new token once, in a reveal card with a sun ring", async () => {
    create.mockResolvedValue({ plaintext: "scim_ab12_secret", token: token("t9", "Okta") })
    render(<ScimProvisioningCard />)
    fireEvent.click(screen.getByRole("button", { name: "New credential" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Okta" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create credential" })))
    const reveal = document.querySelector("[data-token-reveal]") as HTMLElement
    expect(reveal.className).toContain("cfg-reveal-card")
    expect(reveal.textContent).toMatch(/Copy it now, it won't be shown again/)
    expect(reveal.querySelector("[data-code-row] code")?.textContent).toBe("scim_ab12_secret")
  })

  it("gives the endpoint as a code row once a credential is live", () => {
    state.tokens = [token("t1", "Okta production")]
    render(<ScimProvisioningCard />)
    const endpoint = screen.getByText("https://api.kestrel.example/scim/v2")
    expect(endpoint.closest("[data-code-row]")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Copy SCIM base URL" })).toBeTruthy()
  })

  it("puts the plan lock inside the card in place of the controls", () => {
    state.locked = true
    state.tokens = [token("t1", "Okta production")]
    render(<ScimProvisioningCard />)
    const notice = screen.getByText(/SCIM provisioning needs a OneCamp licence/)
    expect(notice.closest("[data-settings-card]")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "New credential" })).toBeNull()
    expect(screen.queryByText("https://api.kestrel.example/scim/v2")).toBeNull()
    // A credential made before stays listed and revocable.
    expect(screen.getByRole("button", { name: "Revoke Okta production" })).toBeTruthy()
  })

  it("is a section whose action stacks under the words on a phone", () => {
    const { container } = render(<ScimProvisioningCard />)
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SECTION")
    expect(root.id).toBe("security-scim")
    expect(screen.getByRole("heading", { level: 2, name: "Directory provisioning (SCIM)" })).toBeTruthy()
    const button = screen.getByRole("button", { name: "New credential" })
    const header = button.closest("[data-section-header]") as HTMLElement
    expect(header.className).toContain("flex-col")
    expect(header.className).toContain("sm:flex-row")
    expect(button.className).toContain("md:h-8")
  })

  it("stands the list's own rows in while the credentials load", () => {
    state.loading = true
    render(<ScimProvisioningCard />)
    const status = screen.getByRole("status", { name: "Loading SCIM credentials" })
    const rows = status.querySelectorAll("li")
    expect(rows.length).toBe(2)
    rows.forEach((li) => expect(li.className).toContain("set-row"))
  })

  it("says a dead credential's state in words, and revokes with a 16px icon", () => {
    state.tokens = [
      token("t1", "Okta production"),
      token("t2", "Old Azure", { revoked_at: "2026-09-02T10:00:00Z" }),
      token("t3", "Rotated", { expires_at: "2026-01-01T00:00:00Z" }),
    ]
    render(<ScimProvisioningCard />)
    expect(screen.getByText("Revoked").closest("[data-status-word]")).toBeTruthy()
    expect(screen.getByText("Expired").closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("warning")
    const revoke = screen.getByRole("button", { name: "Revoke Okta production" })
    expect(revoke.querySelector("svg")?.getAttribute("class")).toContain("h-4 w-4")
  })
})
