import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import type { ReactNode } from "react"
import type { WaitingApproval } from "@/lib/rules/approvals"
import { pinTestClock } from "@/lib/testing/testClock"

// My tasks' requests waiting for my answer (package 9 R2b): the count beside
// the day's counts, and the list it opens, each row to its item.

pinTestClock()

let read: { data?: { data: { items: WaitingApproval[] } } } = {}
vi.mock("@/hooks/useWaitingApprovals", () => ({ useWaitingApprovals: () => read }))
// A row's link is an anchor here; following it is the browser's (e2e/taskApproval).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
// The shared overlay has browser tests of its own: here, a plain stand-in.
vi.mock("@/components/ui/responsive-dialog", () => ({
  ResponsiveDialog: ({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
      <footer>{footer}</footer>
    </div>
  ),
}))

const { WaitingForMe } = await import("@/components/work/approvals/WaitingForMe")

// The list loads the first time it opens (next/dynamic): here once, before
// the tests, so their first sight of it waits on nothing a busy machine slows.
beforeAll(async () => {
  await import("@/components/work/approvals/WaitingApprovalsSheet")
}, 60_000)

const request = (over: Partial<WaitingApproval>): WaitingApproval => ({
  approval_id: "a1", kind: "task", id: "t1", title: "Launch copy", path: "/app/task/t1", requested_by: "u-cy",
  created_at: "2026-10-15T08:00:00Z", project_id: "p1", project_name: "Q4 launch",
  asker: { user_uuid: "u-cy", user_name: "Cy Park" }, ...over,
})
const waiting = (...items: WaitingApproval[]) => ({ data: { data: { items } } })

afterEach(() => {
  cleanup()
  read = {}
})

describe("My tasks' requests waiting for my answer", () => {
  it("says nothing before the read answers, or while nothing waits", () => {
    const { container, rerender } = render(<WaitingForMe />)
    expect(container.textContent).toBe("")
    read = waiting()
    rerender(<WaitingForMe />)
    expect(container.textContent).toBe("")
  })

  it("says how many wait, and opens them as a list, each row to its item", async () => {
    read = waiting(
      request({ ask: "Is the copy final?" }),
      request({ approval_id: "a2", id: "t2", title: "Pricing page", path: "/app/task/t2", to_name: "Done", project_name: "Website", project_id: "p2" }),
    )
    render(<WaitingForMe />)
    fireEvent.click(screen.getByRole("button", { name: /2 to approve/ }))
    const list = await screen.findByRole("dialog", { name: "Waiting for my approval" })
    expect(within(list).getByRole("link", { name: "Launch copy" }).getAttribute("href")).toBe("/app/task/t1")
    expect(within(list).getByRole("link", { name: "Pricing page" }).getAttribute("href")).toBe("/app/task/t2")
    const [asked, moved] = list.querySelectorAll('[data-needs-kind="approval"]')
    expect(asked.textContent).toContain("Is the copy final?")
    expect(asked.textContent).toContain("Q4 launch")
    expect(moved.textContent).toContain("Move to Done")
    expect(moved.textContent).toContain("Website")
  })

  it("closes as a row is followed to its item", async () => {
    read = waiting(request({}))
    render(<WaitingForMe />)
    fireEvent.click(screen.getByRole("button", { name: /1 to approve/ }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("link", { name: "Launch copy" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("says so when the last one is answered while the list is open", async () => {
    read = waiting(request({}))
    const { rerender } = render(<WaitingForMe />)
    fireEvent.click(screen.getByRole("button", { name: /1 to approve/ }))
    await screen.findByRole("dialog")
    read = waiting()
    rerender(<WaitingForMe />)
    expect(within(screen.getByRole("dialog")).getByRole("status").textContent).toBe("Nothing waits for your answer now.")
  })
})
