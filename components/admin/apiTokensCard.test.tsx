import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// API tokens, in a person's settings. The new-token form says what is missing
// under the field it is about (it was a red toast that went while the person
// was still reading), its choices are labelled controls a keyboard and a
// screen reader can work, the tokens are rows in one list, the dialog's title
// carries the section's tile instead of an orange key, and the note about the
// MCP endpoint names the admin tab as it is called.

const { answers, create, toast } = vi.hoisted(() => ({
  answers: {} as Record<string, unknown>,
  create: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => answers[url] ?? { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() },
}))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/lib/utils/mcpEndpoint", () => ({ mcpEndpointUrl: () => "https://ws.example/mcp", mcpClientConfig: () => "{}" }))
vi.mock("@/services/apiTokenService", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiTokenService")>("@/services/apiTokenService")
  return { ...actual, createApiToken: create, revokeApiToken: vi.fn() }
})

import ApiTokensCard from "./ApiTokensCard"

const mutate = vi.fn()
const token = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  name: "CI deploy notifier",
  token_prefix: "oc_9f2c",
  scopes: JSON.stringify(["tasks:read", "messages:write"]),
  created_at: "2026-10-08T14:03:22Z",
  last_used_at: "2026-10-09T09:00:00Z",
  expires_at: "2027-01-06T14:03:22Z",
  revoked_at: null,
  ...over,
})

beforeEach(() => {
  answers["/api-tokens"] = { data: { data: [token(), token({ id: "t2", name: "Old script", revoked_at: "2026-09-01T00:00:00Z" })] }, isLoading: false, isError: undefined, mutate }
  answers["/api-tokens/scopes"] = { data: { data: ["tasks:read", "messages:write"] }, isLoading: false }
  answers["/agents"] = { data: { data: [] }, isLoading: false }
  create.mockReset()
  toast.mockReset()
})
afterEach(cleanup)

const openDialog = () => render(<ApiTokensCard creating onCreatingChange={() => {}} />)
const dialog = () => screen.getByRole("dialog")

describe("the token list", () => {
  it("is rows in one list, not a card per token", () => {
    render(<ApiTokensCard creating={false} onCreatingChange={() => {}} />)
    const list = screen.getByRole("list", { name: "Your API tokens" })
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(list.querySelector(".rounded-xl")).toBeNull()
  })
})

describe("making a token", () => {
  it("says what is missing under the field, and goes to the first one", async () => {
    openDialog()
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Create token" })))
    const name = within(dialog()).getByLabelText("Name")
    expect(name).toHaveAttribute("aria-invalid", "true")
    expect(name).toHaveAccessibleDescription(expect.stringContaining("Give the token a name."))
    expect(within(dialog()).getByText("Choose at least one scope.")).toBeInTheDocument()
    expect(document.activeElement).toBe(name)
    expect(toast).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it("makes its scopes toggle buttons that say whether they are on", () => {
    openDialog()
    const scope = within(dialog()).getByRole("button", { name: /Read tasks/ })
    expect(scope).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(scope)
    expect(scope).toHaveAttribute("aria-pressed", "true")
  })

  // The house segmented look, drawn once (components/ui/segmentedControl):
  // this copy's options were 32px in an 8px well, the theme's 28px in a 4px one.
  it("draws its expiry with the app's segmented control", () => {
    openDialog()
    const group = within(dialog()).getByRole("radiogroup", { name: "Expiry" })
    expect(group.className).toContain("p-1")
    expect(within(group).getByRole("radio", { name: "No expiry" }).className).toContain("md:h-7")
  })

  it("makes its expiry a labelled choice of one", () => {
    openDialog()
    const group = within(dialog()).getByRole("radiogroup", { name: "Expiry" })
    expect(within(group).getByRole("radio", { name: "No expiry" })).toHaveAttribute("aria-checked", "true")
  })

  it("says why a token couldn't be made, in the dialog", async () => {
    create.mockRejectedValue({ response: { status: 400, data: { msg: "A token with that name already exists." } } })
    openDialog()
    fireEvent.change(within(dialog()).getByLabelText("Name"), { target: { value: "CI" } })
    fireEvent.click(within(dialog()).getByRole("button", { name: /Read tasks/ }))
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Create token" })))
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Couldn't create the token. A token with that name already exists.")
  })

  it("titles the dialog with the section's tile, not an orange key", () => {
    openDialog()
    const title = within(dialog()).getByRole("heading", { name: "New API token" })
    expect(title.querySelector("[class*='hue-berry']")).not.toBeNull()
    expect(title.querySelector(".text-primary")).toBeNull()
  })
})
