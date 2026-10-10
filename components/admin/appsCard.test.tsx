import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"

const confirmCalls = vi.hoisted(() => [] as Array<{ title: string; destructive?: boolean; onConfirm: () => void }>)
const toastSpy = vi.hoisted(() => vi.fn())

vi.mock("@/services/appService", () => ({
  listApps: vi.fn(),
  listMarketplace: vi.fn(),
  createApp: vi.fn(),
  updateApp: vi.fn(),
  deleteApp: vi.fn(),
  setAppEnabled: vi.fn(),
  disconnectApp: vi.fn().mockResolvedValue(undefined),
  startOAuthInstall: vi.fn(),
  getApp: vi.fn(),
  testApp: vi.fn(),
  installTemplate: vi.fn(),
  uninstallTemplate: vi.fn(),
}))
vi.mock("@/hooks/useUploadFile", () => ({ useUploadFile: () => ({ makeRequestToUploadToPublic: vi.fn(), validateFiles: (f: FileList) => Array.from(f), uploadLimitMB: 10 }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (opts: (typeof confirmCalls)[number]) => confirmCalls.push(opts) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))

import AppsCard from "@/components/admin/AppsCard"
import { disconnectApp, listApps, listMarketplace } from "@/services/appService"

const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  confirmCalls.length = 0
})

const giphy = {
  id: "a1", slug: "giphy", name: "Giphy", description: "Send GIFs", kind: "oauth", is_enabled: true,
  is_connected: true, has_api_key: false, commands: [{ id: "c1", command: "giphy", description: "" }],
}

describe("apps", () => {
  // A failed read said "No apps installed yet", and the directory above it
  // said `No apps match “”.`, both claims about the workspace.
  it("says the installed apps and the directory could not be loaded, with Try again", async () => {
    vi.mocked(listApps).mockRejectedValue(new Error("Network Error"))
    vi.mocked(listMarketplace).mockRejectedValue(new Error("Network Error"))
    render(<AppsCard />, { wrapper: fresh })
    expect(await screen.findByText(/Couldn't load the installed apps/)).toBeTruthy()
    expect(await screen.findByText(/Couldn't load the app directory/)).toBeTruthy()
    expect(screen.queryByText(/No apps installed yet/)).toBeNull()
    expect(screen.queryByText(/No apps match/)).toBeNull()
    expect(screen.getAllByRole("button", { name: "Try again" }).length).toBe(2)
  })

  it("names the row's controls for the app, and edits with a pencil, not a refresh icon", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    expect(await screen.findByRole("switch", { name: "Use Giphy" })).toBeTruthy()
    const edit = screen.getByRole("button", { name: "Edit Giphy" })
    expect(edit.querySelector(".lucide-refresh-cw")).toBeNull()
  })

  // Disconnecting ended the app's access on one click.
  it("asks before disconnecting an app", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }))
    expect(disconnectApp).not.toHaveBeenCalled()
    expect(confirmCalls[0].title).toMatch(/Giphy/)
    expect(confirmCalls[0].destructive).toBe(true)
    confirmCalls[0].onConfirm()
    await waitFor(() => expect(disconnectApp).toHaveBeenCalledWith("a1"))
  })

  it("asks for a name under the field, not in a toast", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "Add your own app" }))
    fireEvent.click(await screen.findByRole("button", { name: "Install app" }))
    const name = screen.getByLabelText(/^Name/)
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(toastSpy).not.toHaveBeenCalled()
  })

  // The type was two buttons, the chosen one filled in the accent.
  it("chooses the app's type from a radio group", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "Add your own app" }))
    const oauth = await screen.findByRole("radio", { name: "OAuth" })
    fireEvent.click(oauth)
    expect(oauth.getAttribute("aria-checked")).toBe("true")
  })
})
