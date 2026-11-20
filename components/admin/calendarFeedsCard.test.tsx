import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { pinTestClock } from "@/lib/testing/testClock"

// basecamp-05: a workspace admin sees every calendar link members have made
// (never its address) and can stop any of them.

const read = vi.hoisted(() => ({ data: undefined as unknown, isError: undefined as unknown, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: (url: string) => (url === "/admin/calendar/feeds" ? read : { data: undefined }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
const del = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { delete: del } }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))

const { default: CalendarFeedsCard } = await import("./CalendarFeedsCard")

pinTestClock()
afterEach(() => {
  cleanup()
  read.data = undefined
  read.isError = undefined
  read.mutate.mockReset()
  del.mockReset()
  confirm.mockReset()
  toast.mockReset()
})

const person = (name: string) => ({ user_uuid: `u-${name}`, user_name: name, user_full_name: name, user_profile_object_key: "" })
const listing = (feeds: unknown[], more = false) => {
  read.data = { data: { feeds, more } }
}
const ASHA = {
  id: "f1",
  person: person("Asha Rao"),
  target: "workspace",
  scope: "full",
  created_at: "2026-10-14T12:00:00Z",
  last_read_at: "2026-10-15T11:00:00Z",
  // Never sent; were it, the card still wouldn't show it.
  url: "https://api.example/public/calendar/secret-token.ics",
}
const JONAS = { id: "f2", person: person("Jonas"), target: "calendar", calendar: { id: "c1", kind: "project", name: "Launch" }, scope: "busy", created_at: "2026-10-01T09:00:00Z" }
const MIA = { id: "f3", person: person("Mia"), target: "calendar", calendar: { id: "c2", kind: "personal" }, scope: "busy", created_at: "2026-09-01T09:00:00Z" }
const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement

describe("the workspace's calendar links, for an admin", () => {
  it("lists each link: whose, which calendar, what it shows, when made and last read; never its address", () => {
    listing([ASHA, JONAS, MIA])
    render(<CalendarFeedsCard />)
    expect(screen.getByRole("heading", { name: "Calendar links" })).toBeTruthy()
    expect(row("Asha Rao").textContent).toMatch(/All calendars · Everything · Made yesterday · Last read 1h ago/)
    expect(row("Jonas").textContent).toMatch(/Launch · When it's busy · Made 1 Oct · Never read/)
    // A calendar the admin may not see is named by its kind.
    expect(row("Mia").textContent).toMatch(/A personal calendar · When it's busy/)
    expect(document.body.textContent).not.toMatch(/secret-token|https?:/)
    expect(screen.queryByText("Showing the newest 500.")).toBeNull()
  })

  it("stops a link after asking: the row leaves and a toast says so", async () => {
    listing([ASHA, JONAS])
    del.mockResolvedValue({ status: 204 })
    render(<CalendarFeedsCard />)
    fireEvent.click(within(row("Asha Rao")).getByRole("button", { name: "Stop Asha Rao's link" }))
    expect(del).not.toHaveBeenCalled()
    const asked = confirm.mock.lastCall?.[0] as { title: string; description: string; confirmText: string; destructive: boolean; onConfirm: () => Promise<void> }
    expect(asked.title).toBe("Stop Asha Rao's link?")
    // The person is named, so "they" can't read as the calendar apps (CR-326 F3).
    expect(asked.description).toBe("Calendar apps reading it stop updating at once. Asha Rao is told you stopped it and can make a new one.")
    expect(asked.destructive).toBe(true)
    expect(asked.confirmText).toBe("Stop link")
    await asked.onConfirm()
    expect(del).toHaveBeenCalledWith("/admin/calendar/feeds/f1", OWN_ERRORS)
    await waitFor(() => expect(screen.queryByText("Asha Rao")).toBeNull())
    expect(screen.getByText("Jonas")).toBeTruthy()
    expect(toast).toHaveBeenCalledWith({ title: "Asha Rao's link is stopped" })
  })

  it("lets a link already stopped leave calmly, and keeps one the server didn't stop", async () => {
    listing([ASHA, JONAS])
    del.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404, data: { msg: "not found" } } })
    render(<CalendarFeedsCard />)
    fireEvent.click(within(row("Asha Rao")).getByRole("button", { name: "Stop Asha Rao's link" }))
    await (confirm.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }).onConfirm()
    await waitFor(() => expect(screen.queryByText("Asha Rao")).toBeNull())
    expect(toast).toHaveBeenCalledWith({ title: "That link was already stopped" })
    del.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } })
    fireEvent.click(within(row("Jonas")).getByRole("button", { name: "Stop Jonas's link" }))
    await (confirm.mock.lastCall?.[0] as { onConfirm: () => Promise<void> }).onConfirm()
    expect(screen.getByText("Jonas")).toBeTruthy()
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The link wasn't stopped", variant: "destructive" }))
  })

  it("says when no one has a link, when only the newest are shown, and when the read failed", () => {
    listing([])
    render(<CalendarFeedsCard />)
    expect(screen.getByText("No one has a calendar link yet.")).toBeTruthy()
    cleanup()
    listing([JONAS], true)
    render(<CalendarFeedsCard />)
    expect(screen.getByText("Showing the newest 500.")).toBeTruthy()
    cleanup()
    read.data = undefined
    read.isError = new Error("Request failed with status code 500")
    render(<CalendarFeedsCard />)
    expect(screen.getByText(/Couldn't load the calendar links/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(read.mutate).toHaveBeenCalled()
  })
})

// Only workspace admins see it: the card is mounted on the admin page alone,
// whose layout (AdminGate) shows its pages to admins only.
describe("where the calendar links card is mounted", () => {
  it("only on the admin page, behind the admin gate", () => {
    const root = join(__dirname, "..", "..")
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
      }
    }
    for (const top of ["app", "components", "lib", "hooks"]) walk(join(root, top))
    const mounting = files.filter((f) => /components\/admin\/CalendarFeedsCard["']/.test(readFileSync(f, "utf8"))).map((f) => relative(root, f))
    expect(mounting).toEqual(["app/app/admin/page.tsx"])
    expect(readFileSync(join(root, "app/app/admin/layout.tsx"), "utf8")).toMatch(/if \(!selfProfile\.data\?\.data\.user_is_admin\) \{\s*return <AdminOnly \/>/)
  })
})
