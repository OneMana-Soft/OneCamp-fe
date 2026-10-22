import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// API tokens, in a person's settings (design v3, admin S7). The tokens are
// 52px rows in one card with a ⋯ menu whose Revoke asks first; the new-token
// form says what is missing under the field it is about, groups its scopes as
// checkboxes and offers 30 d · 90 d · 1 y · Never; and the token itself is
// shown once, in a reveal card with a copy button, and closing before it was
// copied asks first, because it can't be shown again.

const { answers, create, toast, confirm, revoke } = vi.hoisted(() => ({
  answers: {} as Record<string, unknown>,
  create: vi.fn(),
  toast: vi.fn(),
  confirm: vi.fn(),
  revoke: vi.fn(async () => undefined),
}))
const read: string[] = []
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    read.push(url)
    return answers[url] ?? { data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
vi.mock("@/lib/utils/mcpEndpoint", () => ({ mcpEndpointUrl: () => "https://ws.example/mcp", mcpClientConfig: () => "{}" }))
vi.mock("@/services/apiTokenService", async () => {
  const actual = await vi.importActual<typeof import("@/services/apiTokenService")>("@/services/apiTokenService")
  return { ...actual, createApiToken: create, revokeApiToken: revoke }
})

import ApiTokensCard from "./ApiTokensCard"

Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } })

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
  create.mockReset()
  toast.mockReset()
  confirm.mockReset()
  revoke.mockClear()
})
afterEach(cleanup)

const openDialog = () => render(<ApiTokensCard creating onCreatingChange={() => {}} />)
const dialog = () => screen.getByRole("dialog")

describe("the token list", () => {
  it("is rows in one card, not a card per token, with dates and scope chips", () => {
    render(<ApiTokensCard creating={false} onCreatingChange={() => {}} />)
    const list = screen.getByRole("list", { name: "Your API tokens" })
    const rows = within(list).getAllByRole("listitem")
    expect(rows).toHaveLength(2)
    expect(list.closest("[data-settings-card]")).not.toBeNull()
    expect(rows[0]).toHaveTextContent(/Created .* · last used .* · expires/)
    expect(within(rows[0]).getByText("tasks:read")).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent("Revoked")
  })

  it("shows three scope chips at most, then +n", () => {
    answers["/api-tokens"] = {
      data: { data: [token({ scopes: JSON.stringify(["tasks:read", "tasks:write", "docs:read", "docs:write", "search:read"]) })] },
      isLoading: false,
      isError: undefined,
      mutate,
    }
    render(<ApiTokensCard creating={false} onCreatingChange={() => {}} />)
    expect(screen.getByText("+2")).toBeInTheDocument()
    expect(screen.queryByText("docs:write")).toBeNull()
  })

  it("asks before revoking, from the row's menu, and revokes on yes", async () => {
    render(<ApiTokensCard creating={false} onCreatingChange={() => {}} />)
    const trigger = screen.getByRole("button", { name: "Actions for CI deploy notifier" })
    fireEvent.keyDown(trigger, { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Revoke…" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Revoke the token "CI deploy notifier"?', destructive: true }))
    expect(revoke).not.toHaveBeenCalled()
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(revoke).toHaveBeenCalledWith("t1")
  })

  it("offers New token in the body of an empty list, under the key spot", () => {
    answers["/api-tokens"] = { data: { data: [] }, isLoading: false, isError: undefined, mutate }
    const onCreatingChange = vi.fn()
    render(<ApiTokensCard creating={false} onCreatingChange={onCreatingChange} />)
    expect(screen.getByRole("heading", { name: "No tokens yet" })).toBeInTheDocument()
    expect(document.querySelector("[data-spot-key]")?.getAttribute("width")).toBe("96")
    // Secondary: the header's New token is the page's one primary (QA SH-12).
    expect(screen.getByRole("button", { name: "New token" }).className).not.toMatch(/\bbg-brand\b/)
    fireEvent.click(screen.getByRole("button", { name: "New token" }))
    expect(onCreatingChange).toHaveBeenCalledWith(true)
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

  it("makes its scopes checkboxes, grouped by what they are about", () => {
    openDialog()
    const scope = within(dialog()).getByRole("checkbox", { name: "Read tasks" })
    expect(scope).toHaveAttribute("aria-checked", "false")
    fireEvent.click(scope)
    expect(scope).toHaveAttribute("aria-checked", "true")
    expect(within(dialog()).getByRole("group", { name: "Tasks" })).toContainElement(scope)
  })

  // The house segmented look, drawn once (components/ui/segmentedControl):
  // this copy's options were 32px in an 8px well, the theme's 28px in a 4px one.
  it("draws its expiry with the app's segmented control", () => {
    openDialog()
    const group = within(dialog()).getByRole("radiogroup", { name: "Expiry" })
    expect(group.className).toContain("p-0.5")
    expect(within(group).getByRole("radio", { name: "Never" }).className).toContain("md:h-6")
  })

  it("makes its expiry a labelled choice of 30 d, 90 d, 1 y or Never, 90 days to start", () => {
    openDialog()
    const group = within(dialog()).getByRole("radiogroup", { name: "Expiry" })
    expect(within(group).getAllByRole("radio").map((r) => r.textContent)).toEqual(["30 d", "90 d", "1 y", "Never"])
    expect(within(group).getByRole("radio", { name: "90 d" })).toHaveAttribute("aria-checked", "true")
  })

  it("says why a token couldn't be made, in the dialog", async () => {
    create.mockRejectedValue({ response: { status: 400, data: { msg: "A token with that name already exists." } } })
    openDialog()
    fireEvent.change(within(dialog()).getByLabelText("Name"), { target: { value: "CI" } })
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Read tasks" }))
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Create token" })))
    expect(within(dialog()).getByRole("alert")).toHaveTextContent("Couldn't create the token. A token with that name already exists.")
  })

  it("titles the dialog with the section's tile, not an orange key", () => {
    openDialog()
    const title = within(dialog()).getByRole("heading", { name: "New API token" })
    expect(title.querySelector("[class*='hue-berry']")).not.toBeNull()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  it("offers no MCP or agent setup, in an edition without AI", async () => {
    create.mockResolvedValue({ token: token(), plaintext: "oc_secret" })
    openDialog()
    fireEvent.change(within(dialog()).getByLabelText("Name"), { target: { value: "CI" } })
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Read tasks" }))
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Create token" })))
    expect(within(dialog()).getByText("Token created")).toBeInTheDocument()
    expect(within(dialog()).queryByText(/MCP|AI & agents|AI Models/)).toBeNull()
  })

  // This edition's server has no agents (GET /agents answers 501), so a token
  // binds to none: the card neither reads them nor offers "Act as an agent".
  it("reads no agents and offers none to act as, in an edition without AI", () => {
    read.length = 0
    openDialog()
    expect(read).toContain("/api-tokens")
    expect(read).not.toContain("/agents")
    expect(within(dialog()).queryByText(/agent/i)).toBeNull()
  })
})

describe("the token, shown once", () => {
  const makeOne = async (onCreatingChange = vi.fn()) => {
    create.mockResolvedValue({ token: token(), plaintext: "oc_secret_value" })
    render(<ApiTokensCard creating onCreatingChange={onCreatingChange} />)
    fireEvent.change(within(dialog()).getByLabelText("Name"), { target: { value: "CI" } })
    fireEvent.click(within(dialog()).getByRole("checkbox", { name: "Read tasks" }))
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Create token" })))
    return onCreatingChange
  }

  it("is a reveal card with the token, a copy button and the warning", async () => {
    await makeOne()
    const card = document.querySelector<HTMLElement>("[data-token-reveal]")!
    expect(card).toHaveTextContent("oc_secret_value")
    expect(card).toHaveTextContent("Copy it now. It won't be shown again.")
    const copy = within(card).getByRole("button", { name: "Copy token" })
    await act(async () => void fireEvent.click(copy))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("oc_secret_value")
    expect(within(card).getByRole("button", { name: "Token copied" })).toHaveAttribute("data-copy-state", "copied")
  })

  it("asks before closing when it hasn't been copied", async () => {
    const onCreatingChange = await makeOne()
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: "Close without copying?", description: expect.stringContaining("can't be shown again") }))
    expect(onCreatingChange).not.toHaveBeenCalledWith(false)
    act(() => confirm.mock.calls[0][0].onConfirm())
    expect(onCreatingChange).toHaveBeenCalledWith(false)
  })

  it("closes without asking once it has been copied", async () => {
    const onCreatingChange = await makeOne()
    await act(async () => void fireEvent.click(within(dialog()).getByRole("button", { name: "Copy token" })))
    fireEvent.click(within(dialog()).getByRole("button", { name: "Done" }))
    expect(confirm).not.toHaveBeenCalled()
    expect(onCreatingChange).toHaveBeenCalledWith(false)
  })
})
