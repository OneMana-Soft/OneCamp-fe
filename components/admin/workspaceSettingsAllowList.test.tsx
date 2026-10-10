import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The General tab's workspace settings. An allow-list entry can name a domain
// (@example.com), which lets in only Google Workspace accounts that domain
// manages; the admin is told exactly that, and why a public domain like
// @gmail.com is refused, beside the field. Edits wait in a save bar, survive a
// switch to another admin section, and a settings read that failed offers no
// form to save over: saving an empty allow-list makes the workspace
// invite-only.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const service = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getWorkspaceSettings: service.get,
  updateWorkspaceSettings: service.update,
}))

const { default: WorkspaceSettingsCard, forgetKeptDraft } = await import("./WorkspaceSettingsCard")

const saved = { upload_limit_mb: 10, upload_limit_source: "default", allowed_users: ["@acme.example"], allowed_users_source: "db" }

afterEach(() => {
  cleanup()
  service.get.mockReset()
  service.update.mockReset()
  forgetKeptDraft()
})

const saveBar = () => screen.getByRole("region", { name: "Unsaved changes" })

describe("the allow-list", () => {
  it("says a domain entry admits Google Workspace accounts only, and public domains can't be added", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Who can join without an invitation/)) as HTMLTextAreaElement
    await screen.findByDisplayValue("@acme.example")
    const help = document.getElementById("allowed-users-desc")?.textContent ?? ""
    expect(list.getAttribute("aria-describedby")).toBe("allowed-users-desc")
    expect(help).toMatch(/Google Workspace\s+account that example\.com manages/)
    expect(help).toMatch(/not GitHub, and not a personal Google account/)
    expect(help).toMatch(/Public email domains like @gmail\.com can't be added/)
    expect(help).not.toMatch(/verified address/)
  })

  it("shows why the server refused an entry, beside the field", async () => {
    service.get.mockResolvedValue(saved)
    service.update.mockRejectedValue({ response: { data: { msg: "@gmail.com is a public email domain: anyone can have an address there, so it would let anyone in." } } })
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Who can join without an invitation/)) as HTMLTextAreaElement
    fireEvent.change(list, { target: { value: "@gmail.com" } })
    await act(async () => void fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" })))
    expect(service.update).toHaveBeenCalledWith({ allowed_users: ["@gmail.com"] }, { ownErrors: true })
    expect(screen.getByRole("alert").textContent).toMatch(/^@gmail\.com is a public email domain/)
  })
})

describe("saving workspace settings", () => {
  it("offers no form to save over when the settings couldn't be read", async () => {
    service.get.mockRejectedValueOnce(new Error("503"))
    render(<WorkspaceSettingsCard />)
    expect(await screen.findByText("Couldn't load the workspace settings")).toBeTruthy()
    expect(screen.queryByLabelText(/Who can join without an invitation/)).toBeNull()
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull()
    service.get.mockResolvedValueOnce(saved)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByDisplayValue("@acme.example")).toBeTruthy()
  })

  it("holds an edit in a save bar, and Discard puts it back", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    const list = (await screen.findByLabelText(/Who can join without an invitation/)) as HTMLTextAreaElement
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    fireEvent.change(list, { target: { value: "@acme.example, @kestrel.studio" } })
    fireEvent.click(within(saveBar()).getByRole("button", { name: "Discard" }))
    expect(list.value).toBe("@acme.example")
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  })

  it("keeps an unsaved edit when the admin switches to another section and back", async () => {
    service.get.mockResolvedValue(saved)
    const first = render(<WorkspaceSettingsCard />)
    fireEvent.change(await screen.findByLabelText(/Who can join without an invitation/), { target: { value: "@kestrel.studio" } })
    first.unmount()
    render(<WorkspaceSettingsCard />)
    expect(await screen.findByDisplayValue("@kestrel.studio")).toBeTruthy()
    expect(saveBar()).toBeTruthy()
  })

  it("labels the upload limit, and says a bad size under it instead of saving", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    const size = (await screen.findByLabelText(/Largest file a member can upload/)) as HTMLInputElement
    fireEvent.change(size, { target: { value: "0" } })
    await act(async () => void fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" })))
    expect(service.update).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toMatch(/1 MB or more/)
    expect(size.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(size)
  })
})
