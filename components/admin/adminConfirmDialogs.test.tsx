import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import WebhookDeleteDialog from "@/components/admin/WebhookDeleteDialog"
import GitHubDisconnectDialog from "@/components/admin/GitHubDisconnectDialog"
import GitHubUnlinkDialog from "@/components/admin/GitHubUnlinkDialog"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// Each put a paragraph, a box and a list inside the dialog's description,
// which is itself a <p>: invalid HTML that React warns about and that a
// screen reader reads as one run-on paragraph.
function expectNoBlocksInParagraphs() {
  for (const p of Array.from(document.querySelectorAll("p"))) {
    expect(p.querySelector("p, div, ul, ol")).toBeNull()
  }
}

describe("admin confirm dialogs", () => {
  it("deleting a webhook asks a plain question, in valid HTML, with a red confirm", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    render(<WebhookDeleteDialog open onOpenChange={() => {}} onConfirm={() => {}} webhook={{ id: "w1", name: "Deploy notices", type: "incoming" }} />)
    expect(screen.getByRole("heading", { name: /Delete Deploy notices\?/ })).toBeTruthy()
    expect(screen.queryByText(/Are you sure/)).toBeNull()
    expectNoBlocksInParagraphs()
    expect(err.mock.calls.some((c) => String(c[0]).includes("descendant"))).toBe(false)
    expect(screen.getByRole("button", { name: "Delete webhook" }).className).toContain("bg-destructive")
  })

  it("disconnecting GitHub asks a plain question, in valid HTML", () => {
    render(<GitHubDisconnectDialog open onOpenChange={() => {}} onConfirm={() => {}} repoCount={3} isSubmitting={false} />)
    expect(screen.getByRole("heading", { name: "Disconnect GitHub?" })).toBeTruthy()
    expect(screen.queryByText(/Are you sure/)).toBeNull()
    expect(document.body.textContent).toMatch(/3 linked repositories/)
    expectNoBlocksInParagraphs()
    expect(screen.getByRole("button", { name: "Disconnect GitHub" }).className).toContain("bg-destructive")
  })

  it("unlinking a repository names it in the question, in valid HTML", () => {
    render(<GitHubUnlinkDialog open onOpenChange={() => {}} onConfirm={() => {}} link={{ id: "l1", repo_owner: "kestrel", repo_name: "site" }} isSubmitting={false} />)
    expect(screen.getByRole("heading", { name: "Unlink kestrel/site?" })).toBeTruthy()
    expectNoBlocksInParagraphs()
    expect(screen.getByRole("button", { name: "Unlink repository" }).className).toContain("bg-destructive")
  })

  it("says one repository, not 1 repositories", () => {
    render(<GitHubDisconnectDialog open onOpenChange={() => {}} onConfirm={() => {}} repoCount={1} isSubmitting={false} />)
    expect(screen.getByText("Unlink 1 linked repository")).toBeTruthy()
  })
})
