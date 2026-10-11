import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Design v3, admin A7 (mock M1): the General page's three rules.
//
// 1. The allow-list is a chip input. A comma or Enter makes a chip; an entry
//    the list can't hold is a danger-tinted chip with its reason, and a public
//    email domain is refused under the field before any request, since the
//    server would refuse it anyway and the admin should learn it as they type.
// 2. The channel list never scrolls inside itself: an eighth channel cut off
//    behind an inner scrollbar is how an admin missed one. The first six
//    show, then "Show N more".
// 3. The push credential is given in a dialog with a drop zone (the JSON
//    file), with "Paste instead", never a textarea on the page.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn() }))
const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  channels: vi.fn(),
  setChannels: vi.fn(),
  push: vi.fn(),
  setPush: vi.fn(),
}))
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: async () => ({ data: { data: await api.get() } }), post: vi.fn() },
  OWN_ERRORS: {},
}))
vi.mock("@/services/settingsService", async (orig) => ({
  ...(await orig<typeof import("@/services/settingsService")>()),
  updateWorkspaceSettings: api.update,
  getDefaultChannels: api.channels,
  setDefaultChannels: api.setChannels,
  getPushConfig: api.push,
  setPushConfig: api.setPush,
  clearPushConfig: vi.fn(),
}))

const { SWRConfig } = await import("swr")
const { TooltipProvider } = await import("@/components/ui/tooltip")
const { default: WorkspaceSettingsCard } = await import("./WorkspaceSettingsCard")
const { default: DefaultChannelsCard } = await import("./DefaultChannelsCard")
const { default: PushNotificationsCard } = await import("./PushNotificationsCard")
const { entryProblem, normalizeEntry, splitEntries, PUBLIC_DOMAIN_LINE } = await import("./allowListEntries")

const wrap = (node: React.ReactNode) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
    <TooltipProvider>{node}</TooltipProvider>
  </SWRConfig>
)

afterEach(() => {
  cleanup()
  Object.values(api).forEach((f) => f.mockReset())
})

describe("allow-list entries", () => {
  it("writes a bare domain as a domain entry, and splits a pasted list", () => {
    expect(normalizeEntry(" Kestrel.Example ")).toBe("@kestrel.example")
    expect(splitEntries("a@x.io, @y.io;z.io\nb@y.io")).toEqual(["a@x.io", "@y.io", "@z.io", "b@y.io"])
  })

  it("refuses public domains and things that aren't addresses, and keeps one person at gmail", () => {
    expect(entryProblem("@gmail.com")).toMatch(/public email domain/)
    expect(entryProblem("@outlook.com")).toMatch(/public email domain/)
    expect(entryProblem("nadia.haddad@gmail.com")).toBeNull()
    expect(entryProblem("@kestrel.example")).toBeNull()
    expect(entryProblem("not-an-address")).toMatch(/Not an email address/)
    expect(entryProblem("zoë@kestrel.example")).toMatch(/plain letters/)
  })
})

describe("the chip input", () => {
  const settings = { upload_limit_mb: 250, upload_limit_source: "db", allowed_users: ["@kestrel.example"], allowed_users_source: "db" }

  it("makes a chip on a comma or Enter, each with its glyph and an ×", async () => {
    api.get.mockResolvedValue(settings)
    render(wrap(<WorkspaceSettingsCard />))
    const field = await screen.findByLabelText(/Who can join without an invitation/)
    fireEvent.change(field, { target: { value: "nadia@kestrel.example," } })
    fireEvent.change(field, { target: { value: "lake.io" } })
    fireEvent.keyDown(field, { key: "Enter" })
    const chips = Array.from(document.querySelectorAll("[data-allow-chip]"))
    expect(chips.map((c) => c.textContent?.replace(/:.*$/, ""))).toEqual(["@kestrel.example", "nadia@kestrel.example", "@lake.io"])
    chips.forEach((c) => expect(c.querySelector("svg")).toBeTruthy())
    expect(screen.getByRole("button", { name: "Remove @lake.io" })).toBeTruthy()
    // 24px chips (h-6).
    expect(chips[0].className).toMatch(/(^|\s)h-6(\s|$)/)
  })

  it("tints a refused entry, says a public domain under the field, and won't save", async () => {
    api.get.mockResolvedValue(settings)
    render(wrap(<WorkspaceSettingsCard />))
    const field = await screen.findByLabelText(/Who can join without an invitation/)
    fireEvent.change(field, { target: { value: "@gmail.com," } })
    const chip = Array.from(document.querySelectorAll("[data-allow-chip]")).find((c) => c.textContent?.startsWith("@gmail.com"))!
    expect(chip.getAttribute("data-invalid")).toBe("true")
    expect(chip.className).toMatch(/text-danger-ink/)
    // The reason travels with the chip (its tooltip and its accessible name).
    expect(chip.textContent).toMatch(/public email domain/)
    expect(screen.getByRole("alert").textContent).toBe(PUBLIC_DOMAIN_LINE)
    expect(PUBLIC_DOMAIN_LINE).toBe("Public email domains like gmail.com can't be added.")
    const save = screen.getByRole("button", { name: "Save" }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await act(async () => void fireEvent.click(save))
    expect(api.update).not.toHaveBeenCalled()
    // Removing it clears the line and lets the card save.
    fireEvent.click(screen.getByRole("button", { name: "Remove @gmail.com" }))
    expect(screen.queryByText(PUBLIC_DOMAIN_LINE)).toBeNull()
  })

  it("takes the last chip back into the field on Backspace", async () => {
    api.get.mockResolvedValue(settings)
    render(wrap(<WorkspaceSettingsCard />))
    const field = (await screen.findByLabelText(/Who can join without an invitation/)) as HTMLInputElement
    fireEvent.keyDown(field, { key: "Backspace" })
    expect(field.value).toBe("@kestrel.example")
    expect(document.querySelectorAll("[data-allow-chip]")).toHaveLength(0)
  })
})

describe("where new members start", () => {
  const ch = (n: string) => ({ ch_uuid: n, ch_name: n })
  const names = ["general", "design", "releases", "random", "news", "ops", "sales", "support", "hiring"]

  it("shows six channels with no inner scroll, then Show N more", async () => {
    api.channels.mockResolvedValue({ channels: [ch("general")], chosen: true, available: names.map(ch) })
    render(<DefaultChannelsCard />)
    await screen.findByRole("checkbox", { name: "general" })
    expect(screen.getAllByRole("checkbox")).toHaveLength(6)
    const list = document.querySelector("[data-channel-list]") as HTMLElement
    expect(list.className).not.toMatch(/overflow-(y-)?(auto|scroll)|max-h-/)
    fireEvent.click(screen.getByRole("button", { name: "Show 3 more" }))
    expect(screen.getAllByRole("checkbox")).toHaveLength(9)
    // 40px rows, not the 56px setting row, and # in ink-3.
    const row = screen.getByRole("checkbox", { name: "design" }).closest("[data-channel-row]") as HTMLElement
    expect(row.className).toMatch(/cfg-channel-row/)
    expect(row.querySelector(".text-ink-3")?.textContent).toBe("#")
  })

  it("tags the channel new members open on", async () => {
    api.channels.mockResolvedValue({ channels: [ch("releases"), ch("design")], chosen: true, available: names.map(ch) })
    render(<DefaultChannelsCard />)
    const row = (await screen.findByRole("checkbox", { name: "releases" })).closest("[data-channel-row]") as HTMLElement
    expect(row.querySelector("[data-opens-here]")?.textContent).toBe("Opens here")
    expect(document.querySelectorAll("[data-opens-here]")).toHaveLength(1)
  })

  it("saves a tick at once, keeping the landing channel first", async () => {
    api.channels.mockResolvedValue({ channels: [ch("releases")], chosen: true, available: names.map(ch) })
    api.setChannels.mockImplementation(async (ids: string[]) => ({ channels: ids.map(ch), chosen: true, available: names.map(ch) }))
    render(<DefaultChannelsCard />)
    const design = await screen.findByRole("checkbox", { name: "design" })
    await act(async () => void fireEvent.click(design))
    expect(api.setChannels).toHaveBeenCalledWith(["releases", "design"])
    expect(document.querySelector("[data-saved-tick]")?.textContent).toBe("Saved")
  })
})

describe("the push credential", () => {
  const on = { configured: true, active: true, source: "settings", project_id: "kestrel-camp-push", client_email: "push@kestrel-camp-push.iam.gserviceaccount.com" }

  it("is given in a dialog with a drop zone, not a textarea on the page", async () => {
    api.push.mockResolvedValue(on)
    api.setPush.mockResolvedValue(on)
    render(<PushNotificationsCard />)
    await screen.findByText("kestrel-camp-push")
    expect(screen.queryByRole("textbox")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Replace credential…" }))
    const dialog = await screen.findByRole("dialog")
    const zone = dialog.querySelector("[data-drop-zone]") as HTMLElement
    expect(zone.textContent).toMatch(/Drop the service-account JSON, or choose a file/)
    expect(zone.className).toMatch(/cfg-drop/)
    // Dragged over, the zone says so (its ring and lifted glyph are CSS).
    fireEvent.dragEnter(zone)
    expect(zone.getAttribute("data-drag")).toBe("true")
    // Paste instead: a JSON that isn't a key is refused before sending.
    fireEvent.click(screen.getByRole("button", { name: "Paste instead" }))
    const box = screen.getByRole("textbox", { name: "Service-account JSON" })
    fireEvent.change(box, { target: { value: "{\"hello\": 1}" } })
    expect(screen.getByRole("alert").textContent).toMatch(/isn't a service-account key/)
    const replace = screen.getByRole("button", { name: "Replace credential" }) as HTMLButtonElement
    expect(replace.disabled).toBe(true)
    fireEvent.change(box, { target: { value: JSON.stringify({ type: "service_account", project_id: "kestrel-camp-push", client_email: "a@b.c" }) } })
    expect(replace.disabled).toBe(false)
    await act(async () => void fireEvent.click(replace))
    expect(api.setPush).toHaveBeenCalled()
  })

  it("keeps the drop zone's motion to transform and opacity", () => {
    const css = readFileSync(join(process.cwd(), "app/styles/admin/config.css"), "utf8")
    expect(css).toMatch(/\.cfg-drop\[data-drag="true"\]/)
    expect(css).toMatch(/\.cfg-drop\[data-drag="true"\] \.cfg-drop-glyph\s*\{[^}]*translateY\(-2px\)/)
  })
})
