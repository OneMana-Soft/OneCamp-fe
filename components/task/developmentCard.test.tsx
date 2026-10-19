import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

// Step 3, part 3 (the rivals review against Linear and Jira, 16 Oct): a
// task's GitHub links were a grey box headed "GitHub", the checks a coloured
// dot with a tooltip, hidden on a phone. It is the Development card now: the
// branch, then the pull request with its state and its checks in words,
// then the issue.

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))
vi.mock("@/services/aiModelService", () => ({ analyzeCodeIssue: vi.fn() }))

import { TaskGitHubSection, checksInWords } from "./taskGitHubSection"

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

  it("is nothing at all for a task with no links that this person can't link", () => {
    const { container } = render(<TaskGitHubSection task={{ task_uuid: "t2", task_name: "x" } as never} isAdmin={false} taskUUID="t2" githubConnected={false} {...handlers} />)
    expect(screen.queryByRole("region", { name: "Development" })).toBeNull()
    expect(container.textContent).toBe("")
  })
})
