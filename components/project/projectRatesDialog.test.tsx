import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The rates editor: what it sends, and what it refuses before sending.

const posted: { url: string; body: unknown }[] = []
vi.mock("@/lib/axiosInstance", () => ({ default: { post: async (url: string, body: unknown) => (posted.push({ url, body }), { data: {} }) } }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
const saved = {
  set: true,
  currency: "EUR",
  default_rate_cents: 8500,
  people: [
    { user_uuid: "maya", rate_cents: 12000 },
    { user_uuid: "left", rate_cents: 7000 },
  ],
}
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
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url.endsWith("/rates") ? { data: saved } : url ? members : undefined, isLoading: false, mutate: vi.fn() }),
}))

const { ProjectRatesDialog } = await import("@/components/project/ProjectRatesDialog")

afterEach(() => {
  cleanup()
  posted.length = 0
})

describe("a project's rates", () => {
  it("opens on what's saved, leaves out agents, and sends only the rates people have of their own", async () => {
    const onSaved = vi.fn()
    render(<ProjectRatesDialog projectId="p1" open onOpenChange={() => {}} onSaved={onSaved} />)
    expect((screen.getByLabelText("Everyone, per hour") as HTMLInputElement).value).toBe("85")
    expect((screen.getByLabelText("Maya Chen") as HTMLInputElement).value).toBe("120")
    // Someone who left keeps their rate: it still prices the time they logged.
    expect((screen.getByLabelText("Someone no longer on the project") as HTMLInputElement).value).toBe("70")
    fireEvent.change(screen.getByLabelText("Everyone, per hour"), { target: { value: "90,50" } })
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
