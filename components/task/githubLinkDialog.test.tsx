import { describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

// The real useToast exports a MODULE-LEVEL toast function, so `toast` keeps the
// same identity across renders. A per-call vi.fn() would not, and would
// manufacture the very instability this test exists to rule out.
vi.mock("@/hooks/use-toast", () => {
  const toast = vi.fn()
  return { useToast: () => ({ toast }) }
})
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (v: unknown) => v }))
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

import GitHubIssueSearchDialog from "@/components/task/GitHubIssueSearchDialog"

describe("the GitHub link dialog", () => {
  // Opening this took down the whole app with "Something went wrong": the global
  // error boundary catching React's "Maximum update depth exceeded".
  //
  // usePost returned a fresh object literal every render, so `post` had a new
  // identity each time. performSearch listed it as a dependency, the search
  // effect listed performSearch, and the effect set state. Render, new identity,
  // effect, setState, render, forever.
  //
  // It stayed hidden because the button that opens it is gated on
  // githubConnected, which came from an admin-only endpoint that 403'd for every
  // non-admin. Reading that flag from the feature registry instead made this
  // path reachable for the first time and the loop surfaced immediately.
  it("mounts without an infinite render loop", () => {
    expect(() =>
      render(
        <GitHubIssueSearchDialog open onOpenChange={() => {}} onSuccess={() => {}} taskId="task-1" />,
      ),
    ).not.toThrow()
  })

  // The bulk variant takes taskIds instead of taskId and shares the same effect.
  it("mounts in bulk mode without looping", () => {
    expect(() =>
      render(
        <GitHubIssueSearchDialog
          open
          onOpenChange={() => {}}
          onSuccess={() => {}}
          taskIds={["task-1", "task-2"]}
        />,
      ),
    ).not.toThrow()
  })

  // Closed is the common case and must stay cheap.
  it("mounts closed without looping", () => {
    expect(() =>
      render(
        <GitHubIssueSearchDialog open={false} onOpenChange={() => {}} onSuccess={() => {}} taskId="t" />,
      ),
    ).not.toThrow()
  })
})
