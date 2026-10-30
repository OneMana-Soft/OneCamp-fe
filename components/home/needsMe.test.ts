import { describe, expect, it } from "vitest"
import type { WaitingApproval } from "@/lib/rules/approvals"
import { dueLabel } from "@/lib/utils/dueLabel"
import { pinTestClock } from "@/lib/testing/testClock"
import { approvalsToNeeds, groupNeeds, NEEDS_LABEL, NEEDS_ORDER } from "./needsMe"

// Approvals waiting for the reader (GET /approvals/waiting) on Home, as
// PLATFORM-LEAD-7 agreed (22 Oct): their own group after agent requests, a
// row per request that links to it, and the answers kept in the item's card.

const now = new Date("2026-10-23T09:00:00Z")
pinTestClock(now)
const row = (over: Partial<WaitingApproval> = {}): WaitingApproval => ({
  approval_id: "a1", kind: "task", id: "t1", title: "Launch copy", path: "/app/task/t1", to_name: "Done", requested_by: "u-cy",
  created_at: "2026-10-23T08:00:00Z", project_id: "p1", project_name: "Q4 launch",
  asker: { user_uuid: "u-cy", user_name: "Cy Park" }, ...over,
})

describe("approvals waiting for me, on Home", () => {
  it("are a group of their own, after agent requests and before replies", () => {
    expect(NEEDS_ORDER).toEqual(["agent", "approval", "reply", "due", "email"])
    expect(NEEDS_LABEL.approval).toBe("Approvals")
    const { groups } = groupNeeds([{ id: "dm:1", kind: "reply", title: "Maya wrote to you" }, ...approvalsToNeeds([row()], now)])
    expect(groups.map((g) => g.label)).toEqual(["Approvals", "Replies"])
  })

  it("say the task, what is asked or where it moves, who asked and by when, and link to it", () => {
    const due = "2026-10-24T12:00:00Z"
    const [asked, moved] = approvalsToNeeds([row({ ask: "Is the copy final?", due_at: due }), row({ approval_id: "a2", id: "t2", title: "Pricing page", path: "/app/task/t2" })], now)
    expect(asked).toMatchObject({
      id: "approval:a1", kind: "approval", title: "Launch copy", quote: "Is the copy final?", href: "/app/task/t1",
      taskUuid: "t1", projectUuid: "p1", project: { id: "p1", name: "Q4 launch" },
      person: { id: "u-cy", name: "Cy Park", bot: false }, due: dueLabel(due, now), overdue: false, when: due,
    })
    expect(moved.quote).toBe("Move to Done")
    expect(moved.due).toBeUndefined()
  })

  it("draw an agent that asked as its square, and a passed due date as late", () => {
    const [a] = approvalsToNeeds([row({ due_at: "2026-10-22T09:00:00Z", asker: { user_uuid: "u-bot", user_name: "triage", is_bot: true } })], now)
    expect(a.person).toMatchObject({ id: "u-bot", bot: true })
    expect(a.overdue).toBe(true)
    expect(a.due).toBe(dueLabel("2026-10-22T09:00:00Z", now))
  })

  it("keep a doc's request as a link with no task to act on, and a row whose asker couldn't be read", () => {
    const [doc] = approvalsToNeeds([row({ kind: "doc", id: "d1", path: "/app/doc/d1", to_name: undefined, project_id: undefined, project_name: undefined, asker: undefined })], now)
    expect(doc).toMatchObject({ href: "/app/doc/d1", taskUuid: undefined, project: undefined, person: undefined })
    expect(doc.quote).toBeUndefined()
  })
})
