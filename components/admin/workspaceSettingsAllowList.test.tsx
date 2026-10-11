import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The General tab's workspace settings. An allow-list entry can name a domain
// (@example.com), which lets in only Google Workspace accounts that domain
// manages; the admin is told exactly that behind "How this works". Edits wait
// for the card's footer (design v3, admin A7: a batched card, no dock), and a
// settings read that failed offers no form to save over: saving an empty
// allow-list makes the workspace invite-only.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const service = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
// Read through the one shared SWR key (useWorkspaceSettings), answering from service.get.
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: async () => ({ data: { data: await service.get() } }), post: vi.fn() },
  OWN_ERRORS: {},
}))
vi.mock("@/services/settingsService", async (orig) => ({
  ...(await orig<typeof import("@/services/settingsService")>()),
  updateWorkspaceSettings: service.update,
}))

const { SWRConfig } = await import("swr")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: Card } = await import("./WorkspaceSettingsCard")
const WorkspaceSettingsCard = () => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
    <TooltipProvider>
      <Card />
    </TooltipProvider>
  </SWRConfig>
)

const saved = { upload_limit_mb: 10, upload_limit_source: "default", allowed_users: ["@acme.example"], allowed_users_source: "db" }

afterEach(() => {
  cleanup()
  service.get.mockReset()
  service.update.mockReset()
})

const saveButton = () => screen.getByRole("button", { name: "Save" })
const typeEntry = (field: HTMLElement, text: string) => {
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: "Enter" })
}

describe("the allow-list", () => {
  it("says a domain entry admits Google Workspace accounts only, behind How this works", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    await screen.findByText("@acme.example")
    fireEvent.click(screen.getByRole("button", { name: /How this works/ }))
    const help = screen.getByText(/Empty means invitation only/).textContent ?? ""
    expect(help).toMatch(/Google Workspace\s+account that example\.com manages/)
    expect(help).toMatch(/not GitHub, and not a personal Google account/)
    expect(help).toMatch(/Public email domains like\s+@gmail\.com can't be added/)
  })

  it("shows why the server refused an entry, beside the field", async () => {
    service.get.mockResolvedValue(saved)
    service.update.mockRejectedValue({ response: { data: { msg: "@acme.example is held by another workspace." } } })
    render(<WorkspaceSettingsCard />)
    const field = await screen.findByLabelText(/Who can join without an invitation/)
    typeEntry(field, "@kestrel.example")
    await act(async () => void fireEvent.click(saveButton()))
    expect(service.update).toHaveBeenCalledWith({ allowed_users: ["@acme.example", "@kestrel.example"] }, { ownErrors: true })
    expect(screen.getByRole("alert").textContent).toBe("@acme.example is held by another workspace.")
  })
})

describe("saving workspace settings", () => {
  it("offers no form to save over when the settings couldn't be read", async () => {
    service.get.mockRejectedValueOnce(new Error("503"))
    render(<WorkspaceSettingsCard />)
    expect(await screen.findByText(/Couldn't load the workspace settings/)).toBeTruthy()
    expect(screen.queryByLabelText(/Who can join without an invitation/)).toBeNull()
    expect(screen.queryByRole("button", { name: /^Save/ })).toBeNull()
    service.get.mockResolvedValueOnce(saved)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("@acme.example")).toBeTruthy()
  })

  it("holds an edit in the card until saved, and Reset puts it back", async () => {
    service.get.mockResolvedValue(saved)
    const { container } = render(<WorkspaceSettingsCard />)
    const field = await screen.findByLabelText(/Who can join without an invitation/)
    // The footer is always there; Save waits for something to save.
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    typeEntry(field, "@kestrel.example")
    expect(container.querySelector("[data-settings-card]")?.getAttribute("data-dirty")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(screen.queryByText("@kestrel.example")).toBeNull()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
  })

  it("labels the upload limit, and says a bad size under it instead of saving", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    const size = (await screen.findByLabelText(/Largest file a member can upload/)) as HTMLInputElement
    fireEvent.change(size, { target: { value: "0" } })
    await act(async () => void fireEvent.click(saveButton()))
    expect(service.update).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toMatch(/1 MB or more/)
    expect(size.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(size)
  })

  // The size is a number with its unit inside the field (§1.4), and the
  // allow-list a stacked row whose chips sit under its words.
  it("draws the size with its unit inside, and the allow-list as a stacked row", async () => {
    service.get.mockResolvedValue(saved)
    render(<WorkspaceSettingsCard />)
    const list = await screen.findByLabelText(/Who can join without an invitation/)
    expect(list.closest("[data-setting-row]")?.getAttribute("data-setting-row")).toBe("stacked")
    const size = screen.getByLabelText(/Largest file a member can upload/)
    expect(size.closest("[data-number-unit]")?.textContent).toContain("MB")
  })
})

// Four cards read /admin/settings (this one, read receipts, guest access and
// the email key). They share one request, and a save here updates the others.
describe("the workspace's settings, shared", () => {
  it("puts what a save answered into the shared read, so the other cards show it", async () => {
    service.get.mockResolvedValue(saved)
    service.update.mockResolvedValue({ ...saved, upload_limit_mb: 25 })
    const { useWorkspaceSettings } = await import("@/services/settingsService")
    const Other = () => {
      const { settings } = useWorkspaceSettings()
      return <p>other card: {settings ? `${settings.upload_limit_mb} MB` : "…"}</p>
    }
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 60_000, shouldRetryOnError: false }}>
        <TooltipProvider>
          <Card />
          <Other />
        </TooltipProvider>
      </SWRConfig>,
    )
    const size = (await screen.findByLabelText(/Largest file a member can upload/)) as HTMLInputElement
    expect(await screen.findByText("other card: 10 MB")).toBeTruthy()
    expect(service.get).toHaveBeenCalledTimes(1)
    fireEvent.change(size, { target: { value: "25" } })
    await act(async () => void fireEvent.click(saveButton()))
    expect(await screen.findByText("other card: 25 MB")).toBeTruthy()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
  })
})
