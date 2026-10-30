import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"

// The project's statuses (one of its own, QA, counted as In review) and its members, as the server answers them.
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (key.endsWith("/p1/statuses")) {
      return { data: { data: { built_in: [], custom: [{ id: "c1", project_id: "p1", name: "QA", category: "inReview", color: "teal", position: 0 }], colors: [], max: 20 } }, isLoading: false, mutate: vi.fn() }
    }
    if (key.endsWith("/p1")) {
      return { data: { data: { project_members: [{ user_uuid: "u1", user_name: "Ada Park" }, { user_uuid: "u2", user_name: "Lee Hall" }] } }, isLoading: false, mutate: vi.fn() }
    }
    return { data: undefined, isLoading: false, mutate: vi.fn() }
  },
}))

import { OfflineChanges } from "@/components/offline/OfflineChanges"
import { pinTestClock } from "@/lib/testing/testClock"
import type { Op } from "@/lib/offline/outbox"

const op = (seq: number, extra: Partial<Op>): Op => ({
  seq, opKey: `k${seq}`, kind: "task", id: `t${seq}`, action: "update", method: "POST", url: "/x", payload: {},
  hasBase: true, queuedAt: 0, bytes: 1, state: "conflict", parent: "p1", ...extra,
})

const none = { failed: [] as Op[], held: [] as Op[], onKeep: vi.fn(async () => {}), onRetry: vi.fn(async () => {}), onDiscard: vi.fn(async () => {}), onClose: vi.fn() }

/** The sheet's Yours and Now, conflict by conflict. */
function values(): string[] {
  return [...document.querySelectorAll("[data-offline-conflict] dd")].map((d) => d.textContent ?? "")
}

afterEach(cleanup)
pinTestClock()

describe("the changes that need the member", () => {
  it("one conflict: Keep mine and Keep theirs in the footer", async () => {
    const onKeep = vi.fn(async () => {})
    render(<OfflineChanges {...none} conflicts={[op(1, { field: "task_status", value: "done", theirs: "inReview", label: "Write brief" })]} onKeep={onKeep} />)
    expect(screen.getByText("A change needs you")).toBeTruthy()
    expect(document.body.textContent).toContain("“Write brief”")
    expect(values()).toEqual(["Done", "In review"])
    await act(async () => screen.getByRole("button", { name: "Keep mine" }).click())
    expect(onKeep).toHaveBeenCalledWith(1, "mine")
    await act(async () => screen.getByRole("button", { name: "Keep theirs" }).click())
    expect(onKeep).toHaveBeenCalledWith(1, "theirs")
  })

  it("several: each its own choice, a set-aside change can be retried, and a held one discarded", async () => {
    const onDiscard = vi.fn(async () => {})
    const onRetry = vi.fn(async () => {})
    render(
      <OfflineChanges
        {...none}
        conflicts={[op(1, { field: "task_name", value: "A", theirs: "B" }), op(2, { field: "task_priority", value: "high", theirs: "low" })]}
        failed={[op(4, { state: "failed", field: "task_due_date", tries: 5, label: "Launch" })]}
        held={[op(3, { state: "held", label: "Note" })]}
        onRetry={onRetry}
        onDiscard={onDiscard}
      />,
    )
    expect(screen.getByText("4 changes need you")).toBeTruthy()
    expect(screen.getAllByRole("button", { name: "Keep mine" })).toHaveLength(2)
    expect(document.querySelector("[data-offline-failed]")?.textContent).toContain("“Launch”: the change to Due date keeps failing on the server.")
    await act(async () => screen.getByRole("button", { name: "Retry" }).click())
    expect(onRetry).toHaveBeenCalledWith(4)
    const discards = screen.getAllByRole("button", { name: "Discard" })
    await act(async () => discards[1].click())
    expect(onDiscard).toHaveBeenCalledWith(3)
  })

  it("closes itself when nothing is left", () => {
    const onClose = vi.fn()
    render(<OfflineChanges {...none} conflicts={[]} onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
  })

  it("names a project's own status, and a built-in one in the app's words", () => {
    render(<OfflineChanges {...none} conflicts={[op(1, { field: "task_status", value: "c1", theirs: "canceled" })]} />)
    expect(values()).toEqual(["QA", "Cancelled"])
  })

  it("names the person on both sides of an assignee conflict, and no one as no one", () => {
    render(<OfflineChanges {...none} conflicts={[op(1, { field: "task_assignee", value: "u1", theirs: "u2" }), op(2, { field: "task_assignee", value: "", theirs: "u9" })]} />)
    expect(values()).toEqual(["Ada Park", "Lee Hall", "No one", "A member"])
  })

  it("says dates in the app's words, and the zero time as no date", () => {
    render(<OfflineChanges {...none} conflicts={[op(1, { field: "task_due_date", value: "2025-03-12T00:00:00Z", theirs: "0001-01-01T00:00:00Z" }), op(2, { field: "task_priority", value: "", theirs: "urgent" })]} />)
    const [mine, theirs, noPriority, urgent] = values()
    expect(mine).toMatch(/^1[12] Mar 2025$/)
    expect([theirs, noPriority, urgent]).toEqual(["No date", "No priority", "Urgent"])
  })
})
