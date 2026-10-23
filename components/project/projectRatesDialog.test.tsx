import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The rates editor: what it sends, and what it refuses before sending.

const saved = {
  set: true,
  updated_at: "2026-10-22T09:30:00.123456Z",
  currency: "EUR",
  default_rate_cents: 8500,
  people: [
    { user_uuid: "maya", rate_cents: 12000 },
    { user_uuid: "left", rate_cents: 7000 },
  ],
}
// Another admin's save, made while the dialog is open.
const theirs = { ...saved, updated_at: "2026-10-22T10:05:00.5Z", default_rate_cents: 9500 }
// What the server holds; a test sets theirs to have the other admin save.
let current: typeof saved = saved

// The server refuses a save made from a version that isn't the one it holds.
const posted: { url: string; body: unknown }[] = []
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    post: async (url: string, body: { updated_at?: string }) => {
      posted.push({ url, body })
      if (url.endsWith("/rates") && body.updated_at !== current.updated_at) {
        throw Object.assign(new Error("Request failed with status code 409"), {
          response: { status: 409, data: { msg: "These rates changed after you opened them." } },
        })
      }
      return { data: {} }
    },
  },
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
// As the server sends them: admins as bare ids, members by user name.
const members = {
  data: {
    project_admins: [{ user_uuid: "maya" }],
    project_members: [
      { user_uuid: "maya", user_name: "Maya Chen" },
      { user_uuid: "jonas", user_name: "Jonas Weber" },
    ],
  },
}
// Set by a test whose rates read fails, as SWR answers one: no data, an error.
let ratesRead: Error | undefined
const reread = vi.fn(async () => (ratesRead ? undefined : { data: current }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) =>
    url.endsWith("/rates") && ratesRead
      ? { data: undefined, isLoading: false, isError: ratesRead, mutate: reread }
      : url.endsWith("/rates")
        ? { data: { data: current }, isLoading: false, mutate: reread }
        : { data: url ? members : undefined, isLoading: false, mutate: vi.fn() },
}))

const { ProjectRatesDialog } = await import("@/components/project/ProjectRatesDialog")

afterEach(() => {
  cleanup()
  posted.length = 0
  ratesRead = undefined
  current = saved
  reread.mockClear()
})

describe("a project's rates", () => {
  // S1: a failed read drew an empty form in USD, and saving it replaced the
  // currency and wiped every person's own rate.
  it("says a failed read with Try again, and has no form to save", async () => {
    ratesRead = new Error("Request failed with status code 503")
    await act(async () => render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />))
    expect(screen.getByText(/couldn.t load these rates/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save rates" })).toBeNull()
    expect(screen.queryByLabelText("Everyone, per hour")).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(reread).toHaveBeenCalledTimes(1)
    expect(posted).toHaveLength(0)
  })

  it("sends back the version of the rates it read", async () => {
    await act(async () => render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />))
    await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Save rates" }).closest("form")!))
    expect(posted[0]?.body).toMatchObject({ updated_at: saved.updated_at })
  })

  // A read again in the background (back to the tab) brings another admin's
  // rates, and the form keeps showing the first. Sending the later read's
  // version saved the form over rates the person never saw.
  it("sends the version the form shows, not a later read's", async () => {
    const { rerender } = render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    current = theirs
    rerender(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    expect((screen.getByLabelText("Everyone, per hour") as HTMLInputElement).value).toBe("85")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rates" })))
    expect(posted[0]?.body).toMatchObject({ updated_at: saved.updated_at })
  })

  it("shows the rates as they are now when a save is refused for changes since, and saves on them", async () => {
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    current = theirs
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rates" })))
    expect(reread).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText("Everyone, per hour") as HTMLInputElement).value).toBe("95")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rates" })))
    expect(posted).toHaveLength(2)
    expect(posted[1]?.body).toMatchObject({ updated_at: theirs.updated_at, default_rate_cents: 9500 })
  })

  it("opens on what's saved, leaves out agents, and sends only the rates people have of their own", async () => {
    const onSaved = vi.fn()
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={onSaved} />)
    expect((screen.getByLabelText("Everyone, per hour") as HTMLInputElement).value).toBe("85")
    expect((screen.getByLabelText("Maya Chen") as HTMLInputElement).value).toBe("120")
    // Someone who left keeps their rate: it still prices the time they logged.
    expect((screen.getByLabelText("Someone no longer on the project") as HTMLInputElement).value).toBe("70")
    fireEvent.change(screen.getByLabelText("Everyone, per hour"), { target: { value: "90.50" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rates" })))
    expect(posted[0]).toEqual({
      url: "/project/p1/rates",
      body: {
        currency: "EUR",
        default_rate_cents: 9050,
        people: [
          { user_uuid: "maya", rate_cents: 12000 },
          { user_uuid: "left", rate_cents: 7000 },
        ],
        updated_at: saved.updated_at,
      },
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it("says which rate isn't money instead of sending it", async () => {
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Jonas Weber"), { target: { value: "ten" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save rates" })))
    expect(screen.getByRole("alert").textContent).toContain("Jonas Weber's rate")
    expect(posted).toHaveLength(0)
  })

  it("asks for the rate for everyone rather than billing them at nothing", async () => {
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Everyone, per hour"), { target: { value: "" } })
    await act(async () => fireEvent.submit(screen.getByRole("button", { name: "Save rates" }).closest("form")!))
    expect(screen.getByRole("alert").textContent).toContain("Use 0 if their time isn't billed")
    expect(posted).toHaveLength(0)
  })

  it("stops billing a project", async () => {
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Stop billing this project" })))
    expect(posted[0].url).toBe("/project/p1/rates/delete")
  })
})

describe("the time dialog's look (work.md W52)", () => {
  it("puts its totals on a sunken band and draws billable time in the theme's progress", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("components/project/ProjectTimeDialog.tsx", "utf8")
    expect(src).toMatch(/data-kpi-band="" className="[^"]*bg-sunken/)
    expect(src).toMatch(/data-time-bar=""[^>]*h-1\b/)
    expect(src).toContain("bg-progress")
    expect(src).not.toContain("bg-foreground/60")
  })
})
