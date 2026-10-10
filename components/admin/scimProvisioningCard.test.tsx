import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Directory provisioning. Credentials are rows in one list (they were a card
// each), dates read in the app's one format, a missing name is said under the
// field instead of in a toast, expiry is one choice of three as radios, and
// the workspace group's hue (sun) carries the icons instead of the accent.

const state = vi.hoisted(() => ({ tokens: [] as unknown[], loading: false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () =>
    state.loading
      ? { data: undefined, isLoading: true, isError: undefined, mutate: vi.fn() }
      : { data: { data: { tokens: state.tokens } }, isLoading: false, isError: undefined, mutate: vi.fn() },
}))
vi.mock("@/hooks/usePlan", () => ({ usePlan: () => ({ isLocked: () => false, upgradeUrl: undefined }) }))
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
})

describe("directory provisioning", () => {
  it("lists credentials as rows in one list, with dates in the app's format", () => {
    state.tokens = [token("t1", "Okta production"), token("t2", "Azure staging", { last_used_at: null })]
    render(<ScimProvisioningCard />)
    const row = screen.getByText("Okta production").closest("li")!
    expect(row.parentElement?.className).toMatch(/divide-y/)
    expect(row.className).not.toMatch(/rounded-xl/)
    expect(within(row).getByText(/^Last used \d{1,2} Oct, \d{1,2}:\d{2} (AM|PM)$/)).toBeTruthy()
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

  it("puts its icons on the workspace group's sun tiles, not in the accent", () => {
    render(<ScimProvisioningCard />)
    expect(document.querySelector(".hue-sun [data-empty-icon]")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "New credential" }))
    const title = document.querySelector("[role='dialog'] h2")!
    expect(title.querySelector(".hue-sun svg")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  // A bordered card with a p-4 header, holding a notice box, a token card and a
  // setup box with a code box inside: four levels of box, beside Guest access's
  // flat section. Now one section like the rest, and its header stacks on a phone.
  it("is a flat section whose action stacks under the words on a phone", () => {
    const { container } = render(<ScimProvisioningCard />)
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SECTION")
    expect(root.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(screen.getByRole("heading", { level: 2, name: "Directory provisioning (SCIM)" })).toBeTruthy()
    const button = screen.getByRole("button", { name: "New credential" })
    const header = button.closest("[data-section-header]") as HTMLElement
    expect(header.className).toContain("flex-col")
    expect(header.className).toContain("sm:flex-row")
    expect(button.className).toContain("md:h-8")
  })

  it("says where to point the identity provider as a section of its own, one box deep", () => {
    state.tokens = [token("t1", "Okta production")]
    render(<ScimProvisioningCard />)
    const h3 = screen.getByRole("heading", { level: 3, name: "Point your identity provider here" })
    const section = h3.closest("section") as HTMLElement
    expect(section.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(section.className).not.toContain("bg-muted")
  })

  it("stands the list's own rows in while the credentials load", () => {
    state.loading = true
    render(<ScimProvisioningCard />)
    const status = screen.getByRole("status", { name: "Loading SCIM credentials" })
    expect(status.className).toMatch(/divide-y/)
    const rows = status.querySelectorAll("li")
    expect(rows.length).toBe(2)
    rows.forEach((li) => expect(li.className).toContain("px-4 py-3"))
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
