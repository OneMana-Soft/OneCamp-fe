import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// Directory provisioning. Credentials are rows in one list (they were a card
// each), dates read in the app's one format, a missing name is said under the
// field instead of in a toast, expiry is one choice of three as radios, and
// the workspace group's hue (sun) carries the icons instead of the accent.

const state = vi.hoisted(() => ({ tokens: [] as unknown[] }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { tokens: state.tokens } }, isLoading: false, isError: undefined, mutate: vi.fn() }),
}))
vi.mock("@/hooks/usePlan", () => ({ usePlan: () => ({ isLocked: () => false, upgradeUrl: undefined }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const create = vi.hoisted(() => vi.fn())
vi.mock("@/services/scimTokenService", async (orig) => ({
  ...(await orig<typeof import("@/services/scimTokenService")>()),
  createScimToken: create,
  revokeScimToken: vi.fn(),
  scimBaseUrl: () => "https://api.kestrel.studio/scim/v2",
}))

const { default: ScimProvisioningCard } = await import("./ScimProvisioningCard")

const token = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, token_prefix: "scim_ab12", created_at: "2026-09-01T10:00:00Z", last_used_at: "2026-10-10T08:42:00Z", expires_at: null, revoked_at: null, ...over,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  state.tokens = []
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
})
