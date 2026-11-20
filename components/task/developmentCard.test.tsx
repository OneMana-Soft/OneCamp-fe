import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

// Step 3, part 3 (the rivals review against Linear and Jira, 16 Oct): a
// task's GitHub links were a grey box headed "GitHub", the checks a coloured
// dot with a tooltip, hidden on a phone. It is the Development card now: the
// branch, then the pull request with its state and its checks in words,
// then the issue.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))

import { TaskGitHubSection, checksInWords, reviewInWords } from "./taskGitHubSection"

afterEach(cleanup)

const noop = () => {}
const handlers = { onRetrySync: noop, onRefresh: noop, onBackfill: noop, onUnlink: noop, onCreatePR: noop, onLinkGitHub: noop }
const linked = {
  task_uuid: "t1",
  task_name: "Write the FAQ",
  task_github_branch: "feature/1a2b3c4d-write-the-faq",
  task_github_pr_url: "https://github.com/onemana/app/pull/42",
  task_github_pr_number: 42,
  task_github_pr_state: "open",
  task_github_pr_check_status: "failure",
  task_github_issue_url: "https://github.com/onemana/app/issues/17",
  task_github_issue_number: 17,
}

describe("the Development card", () => {
  it("lists the branch, then the pull request with its state and checks in words, then the issue", () => {
    render(<TaskGitHubSection task={linked as never} isAdmin={false} taskUUID="t1" githubConnected={false} {...handlers} />)
    const card = screen.getByRole("region", { name: "Development" })
    const rows = within(card).getAllByRole("term").map((t) => t.textContent)
    expect(rows).toEqual(["Branch", "Pull request", "Issue"])
    const pr = within(card).getByRole("link", { name: /onemana\/app#42/ })
    expect(pr.getAttribute("href")).toBe("https://github.com/onemana/app/pull/42")
    const prRow = pr.closest("[data-dev-row]") as HTMLElement
    expect(prRow.textContent).toContain("Open")
    const checks = within(prRow).getByText("Checks failing")
    expect(checks.className).toContain("text-danger-ink")
    expect(within(card).getByRole("link", { name: /onemana\/app#17/ }).getAttribute("href")).toBe("https://github.com/onemana/app/issues/17")
    expect(within(card).getByText("feature/1a2b3c4d-write-the-faq")).toBeTruthy()
  })

  it("says what the checks are doing in words, each in its tone", () => {
    expect(checksInWords("success")).toEqual({ text: "Checks passing", tone: "ok" })
    expect(checksInWords("failure")).toEqual({ text: "Checks failing", tone: "bad" })
    expect(checksInWords("action_required")).toEqual({ text: "Action required", tone: "bad" })
    expect(checksInWords("in_progress")).toEqual({ text: "Checks running", tone: "busy" })
    expect(checksInWords("queued")).toEqual({ text: "Checks running", tone: "busy" })
    expect(checksInWords("skipped")).toEqual({ text: "Checks skipped", tone: "quiet" })
    expect(checksInWords(undefined)).toBeNull()
  })

  it("says how the pull request was reviewed in words, each in its tone, and nothing for any other value", () => {
    expect(reviewInWords("approved")).toEqual({ text: "Approved", tone: "ok" })
    expect(reviewInWords("changes_requested")).toEqual({ text: "Changes requested", tone: "bad" })
    expect(reviewInWords("commented")).toEqual({ text: "Reviewed", tone: "quiet" })
    expect(reviewInWords("")).toBeNull()
    expect(reviewInWords(undefined)).toBeNull()
    expect(reviewInWords(null)).toBeNull()
    expect(reviewInWords("APPROVED")).toBeNull()
    expect(reviewInWords("dismissed")).toBeNull()
  })

  // V-670 (13 Nov): the server keeps the pull request's review state on the
  // task, and the card never showed it. It reads in the pull request row,
  // after the state word and before the checks, through the same dot and
  // words the checks use.
  const prRowOf = (review: string) => {
    render(<TaskGitHubSection task={{ ...linked, task_github_pr_review_state: review } as never} isAdmin={false} taskUUID="t1" githubConnected={false} {...handlers} />)
    const card = screen.getByRole("region", { name: "Development" })
    return within(card).getByRole("link", { name: /onemana\/app#42/ }).closest("[data-dev-row]") as HTMLElement
  }

  it("shows an approved pull request as Approved, between its state and its checks", () => {
    const prRow = prRowOf("approved")
    expect(prRow.getAttribute("data-dev-row")).toBe("pr")
    const review = within(prRow).getByText("Approved")
    expect(review.className).toContain("text-success-ink")
    const text = prRow.textContent ?? ""
    expect(text.indexOf("Open")).toBeLessThan(text.indexOf("Approved"))
    expect(text.indexOf("Approved")).toBeLessThan(text.indexOf("Checks failing"))
  })

  it("shows requested changes as Changes requested, in the bad tone", () => {
    const prRow = prRowOf("changes_requested")
    expect(within(prRow).getByText("Changes requested").className).toContain("text-danger-ink")
  })

  it("shows a review with only comments as Reviewed, in the quiet tone", () => {
    const prRow = prRowOf("commented")
    expect(within(prRow).getByText("Reviewed").className).toContain("text-ink-3")
  })

  it.each(["", "dismissed"])("shows no review words for a review state of %j", (review) => {
    const prRow = prRowOf(review)
    expect(within(prRow).queryByText(/^(Approved|Changes requested|Reviewed)$/)).toBeNull()
    expect(within(prRow).getByText("Checks failing")).toBeTruthy()
  })

  it("draws the review and the checks with one shared dot-and-words piece, the dot hidden from readers", () => {
    const prRow = prRowOf("approved")
    const pieces = Array.from(prRow.querySelectorAll("[data-dot-words]")) as HTMLElement[]
    expect(pieces.map((p) => p.textContent)).toEqual(["Approved", "Checks failing"])
    expect(pieces.map((p) => p.getAttribute("data-dot-words"))).toEqual(["ok", "bad"])
    for (const piece of pieces) {
      const [dot, words] = Array.from(piece.children) as HTMLElement[]
      expect(dot.getAttribute("aria-hidden")).toBe("true")
      expect(dot.textContent).toBe("")
      expect(words.textContent).not.toBe("")
    }
  })

  it("is nothing at all for a task with no links that this person can't link", () => {
    const { container } = render(<TaskGitHubSection task={{ task_uuid: "t2", task_name: "x" } as never} isAdmin={false} taskUUID="t2" githubConnected={false} {...handlers} />)
    expect(screen.queryByRole("region", { name: "Development" })).toBeNull()
    expect(container.textContent).toBe("")
  })
})
