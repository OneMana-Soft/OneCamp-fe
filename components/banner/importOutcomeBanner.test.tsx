import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ImportOutcome } from "@/services/importService"

let outcomes: ImportOutcome[] | undefined
const asked: string[] = []
const refetch = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    asked.push(url)
    return { data: url && outcomes ? { outcomes } : undefined, mutate: refetch }
  },
}))
const seen: string[] = []
vi.mock("@/services/importService", async (orig) => ({
  ...(await orig<typeof import("@/services/importService")>()),
  markImportOutcomeSeen: vi.fn(async (id: string) => {
    seen.push(id)
  }),
}))
vi.mock("@/components/admin/ImportInviteDialog", () => ({
  ImportInviteDialog: ({ jobId, label }: { jobId: string; label?: string }) => <p>inviting from {label} ({jobId})</p>,
}))
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }))

const { ImportOutcomeBanner } = await import("./ImportOutcomeBanner")

afterEach(() => {
  cleanup()
  asked.length = 0
  seen.length = 0
})

const outcome = (o: Partial<ImportOutcome> = {}): ImportOutcome => ({
  job_id: "j1",
  provider: "asana",
  label: "Acme",
  status: "completed",
  items_imported: 1240,
  finished_at: new Date().toISOString(),
  people_to_invite: 12,
  ...o,
})

describe("the banner that says how an import ended", () => {
  it("says nothing and asks nothing for someone who isn't an admin", () => {
    outcomes = [outcome()]
    const { container } = render(<ImportOutcomeBanner isAdmin={false} />)
    expect(container.textContent).toBe("")
    expect(asked.at(-1)).toBe("")
  })

  it("says a finished import came across and offers its people", () => {
    outcomes = [outcome()]
    render(<ImportOutcomeBanner isAdmin />)
    expect(screen.getByRole("status").textContent).toMatch(/Your Asana import of Acme finished: 1,240 items came across\./)
    fireEvent.click(screen.getByRole("button", { name: "Invite the 12 people who came across" }))
    expect(screen.getByText("inviting from Acme (j1)")).toBeTruthy()
  })

  it("says why an import stopped, and offers nobody", () => {
    outcomes = [outcome({ provider: "slack", status: "failed", error: "Slack token expired", people_to_invite: 0 }), outcome({ job_id: "j2" })]
    render(<ImportOutcomeBanner isAdmin />)
    expect(screen.getByRole("status").textContent).toMatch(/Your Slack import of Acme stopped: Slack token expired\. And 1 more\./)
    expect(screen.queryByRole("button", { name: /Invite/ })).toBeNull()
    expect(screen.getByRole("link", { name: "Open imports" }).getAttribute("href")).toBe("/app/admin?tab=import")
  })

  it("is dismissed at once, on the server too", async () => {
    outcomes = [outcome()]
    render(<ImportOutcomeBanner isAdmin />)
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(screen.queryByRole("status")).toBeNull()
    await waitFor(() => expect(seen).toEqual(["j1"]))
    expect(refetch).toHaveBeenCalled()
  })
})
