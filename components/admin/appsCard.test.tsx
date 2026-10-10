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

  // A category is a thing with a colour: the chosen filter shows its camp
  // hue's tint and ink, never the accent; "All" stays neutral.
  it("shows the chosen category in its own hue, not the accent", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([
      { slug: "zoom", name: "Zoom", description: "Calls", category: "Video", commands: [], installed: false } as never,
    ])
    render(<AppsCard />, { wrapper: fresh })
    const video = await screen.findByRole("button", { name: "Video" })
    fireEvent.click(video)
    expect(video.getAttribute("aria-pressed")).toBe("true")
    expect(video.className).toMatch(/\bhue-(sky|moss|sun|dusk|berry|lake)\b/)
    expect(video.className).toMatch(/bg-hue-tint/)
    expect(video.className).not.toMatch(/bg-primary/)
    expect(screen.getByRole("button", { name: "All" }).className).not.toMatch(/hue-/)
  })

  it("shows the plug spot when no app is installed", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    expect(await screen.findByText("No apps installed yet")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
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

  // The tab is one section like every other: an h2, and its action in the
  // header's slot at the shared height.
  it("is a section titled by an h2, with Add your own app in the header's slot", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    const heading = await screen.findByRole("heading", { level: 2, name: "Apps" })
    const action = heading.closest("section")?.querySelector("[data-section-action]") as HTMLElement
    const button = screen.getByRole("button", { name: "Add your own app" })
    expect(action.contains(button)).toBe(true)
    expect(button.className).toContain("md:h-8")
    expect(button.className).toContain("h-11")
  })

  // What is installed was under the whole directory, a long scroll down; it
  // is the shorter list and the one an admin comes back to manage.
  it("lists the installed apps before the directory", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    const installed = await screen.findByRole("heading", { level: 3, name: "Installed apps" })
    const directory = screen.getByRole("heading", { level: 3, name: "App directory" })
    expect(installed.compareDocumentPosition(directory) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Under All, each category had its own two-column grid, so a category of
  // one app left half a row empty, four times over. One grid now, and each
  // card says its category.
  it("lays every app of the directory in one grid, each card naming its category", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([
      { slug: "zoom", name: "Zoom", description: "Calls", category: "Video", commands: ["zoom"], installed: false },
      { slug: "figma", name: "Figma", description: "Files", category: "Design", commands: ["figma"], installed: false },
      { slug: "linear", name: "Linear", description: "Issues", category: "Productivity", commands: ["linear"], installed: false },
    ] as never)
    render(<AppsCard />, { wrapper: fresh })
    await screen.findByText("Zoom")
    const grids = document.querySelectorAll("[data-app-grid]")
    expect(grids).toHaveLength(1)
    expect(grids[0].children).toHaveLength(3)
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull()
    const zoom = screen.getByText("Zoom").closest("[data-app-card]") as HTMLElement
    expect(zoom.querySelector("[data-app-category]")?.textContent).toBe("Video")
  })

  it("draws the installed list's own rows while it loads", async () => {
    vi.mocked(listApps).mockReturnValue(new Promise(() => {}) as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    const status = await screen.findByRole("status", { name: "Loading the installed apps" })
    expect(status.className).toContain("divide-y")
    expect(status.querySelectorAll("[data-app-skeleton-row]").length).toBe(3)
  })

  it("says a connection with the app's status word, and a command without an icon the slash already says", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy, { ...giphy, id: "a2", name: "Linear", is_connected: false }] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    const connected = await screen.findByText("Connected")
    expect(connected.closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
    expect(screen.getByText("Not connected").closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("neutral")
    const chip = screen.getAllByText("/giphy")[0]
    expect(chip.querySelector("svg")).toBeNull()
  })

  it("draws the first run's plug at the muted size", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    await screen.findByText("No apps installed yet")
    const spot = document.querySelector("[data-empty-illustration]") as HTMLElement
    expect(spot.className).toContain("[&>svg]:size-16")
  })

  // A search with no match was a centred line of grey text with no way back.
  it("says a search found nothing, with a way to clear it", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([
      { slug: "zoom", name: "Zoom", description: "Calls", category: "Video", commands: [], installed: false },
    ] as never)
    render(<AppsCard />, { wrapper: fresh })
    await screen.findByText("Zoom")
    fireEvent.change(screen.getByRole("searchbox", { name: "Search the app directory" }), { target: { value: "jira" } })
    expect(await screen.findByText(/No apps match/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(await screen.findByText("Zoom")).toBeTruthy()
  })

  it("picks a new app's kind with the app's segmented control", async () => {
    vi.mocked(listApps).mockResolvedValue([])
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "Add your own app" }))
    const external = await screen.findByRole("radio", { name: "External" })
    expect(external.getAttribute("data-state")).toBe("checked")
    expect(external.className).toContain("data-[state=checked]:bg-card")
  })

  it("folds an installed app's controls under its words on a phone", async () => {
    vi.mocked(listApps).mockResolvedValue([giphy] as never)
    vi.mocked(listMarketplace).mockResolvedValue([])
    render(<AppsCard />, { wrapper: fresh })
    const row = (await screen.findByRole("switch", { name: "Use Giphy" })).closest("[data-app-row]") as HTMLElement
    const body = row.children[1] as HTMLElement
    expect(body.className).toContain("flex-col")
    expect(body.className).toContain("sm:flex-row")
  })
})
