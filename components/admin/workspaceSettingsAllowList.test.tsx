import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// An allow-list entry can name a domain (@example.com), which lets in only
// Google Workspace accounts that domain manages; the admin is told exactly
// that, and why a public domain like @gmail.com is refused, beside the field.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const service = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getWorkspaceSettings: async () => ({ upload_limit_mb: 10, upload_limit_source: "default", allowed_users: ["@acme.example"], allowed_users_source: "db" }),
  updateWorkspaceSettings: service.update,
}))

const { default: WorkspaceSettingsCard } = await import("./WorkspaceSettingsCard")

afterEach(() => {
  cleanup()
  service.update.mockReset()
})

describe("the allow-list", () => {
  it("says a domain entry admits Google Workspace accounts only, and public domains can't be added", async () => {
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Allowed emails and domains/)) as HTMLTextAreaElement
    await screen.findByDisplayValue("@acme.example")
    const help = document.getElementById("allowed-users-help")?.textContent ?? ""
    expect(list.getAttribute("aria-describedby")).toBe("allowed-users-help")
    expect(help).toMatch(/Google Workspace\s+account that example\.com manages/)
    expect(help).toMatch(/not GitHub, and not a personal Google account/)
    expect(help).toMatch(/Public email domains like @gmail\.com can't be added/)
    expect(help).not.toMatch(/verified address/)
  })

  it("shows why the server refused an entry, beside the field", async () => {
    service.update.mockRejectedValue({ response: { data: { msg: "@gmail.com is a public email domain: anyone can have an address there, so it would let anyone in." } } })
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Allowed emails and domains/)) as HTMLTextAreaElement
    fireEvent.change(list, { target: { value: "@gmail.com" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save allow-list" })))
    expect(service.update).toHaveBeenCalledWith({ allowed_users: ["@gmail.com"] }, { ownErrors: true })
    expect(screen.getByRole("alert").textContent).toMatch(/^@gmail\.com is a public email domain/)
  })
})
