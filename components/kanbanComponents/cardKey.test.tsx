import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { Item } from "@/components/kanbanComponents/Item/Item"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TaskInfoInterface } from "@/types/task"

afterEach(cleanup)
pinTestClock()

/**
 * A board card's top line (STEP4 #8, Jira's and Linear's cards): the type's
 * glyph, the key in text-micro ink-3 and the blocked lock, above the labels
 * and the title. The lock moved there from the meta row: it shows once.
 */
const task = (over: Partial<TaskInfoInterface> = {}) =>
  ({
    task_uuid: "t-1",
    task_name: "Write the launch announcement",
    task_status: "todo",
    task_priority: "high",
    task_label: "Launch",
    task_due_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_comment_count: 0,
    task_sub_task_count: 0,
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
    ...over,
  }) as unknown as TaskInfoInterface

describe("a board card's key", () => {
  it("sits on the top line, before the labels and the title, with the lock after it, once", async () => {
    const { container } = render(<Item task={task({ task_key: "Q4-12", task_blocked_open: 2, task_work_type: { id: "b", builtin: "bug", name: "Bug", icon: "bug" } })} value="t-1" />)
    const line = container.querySelector<HTMLElement>("[data-card-key]")!
    expect(line.className).toContain("text-micro")
    expect(line.className).toContain("text-ink-3")
    expect(line.textContent).toContain("Q4-12")
    expect(line.querySelector("[title='Blocked by 2 tasks']")).toBeTruthy()
    expect(container.querySelectorAll("[title='Blocked by 2 tasks']")).toHaveLength(1)
    expect(container.querySelector("[data-card-meta] [title='Blocked by 2 tasks']")).toBeNull()
    const order = [...container.querySelectorAll("[data-card-key], [data-card-labels], [data-card-title]")].map((el) => Object.keys((el as HTMLElement).dataset)[0])
    expect(order).toEqual(["cardKey", "cardLabels", "cardTitle"])
    expect(await screen.findByRole("img", { name: "Bug" }, { timeout: 5000 })).toBeTruthy()
  })

  it("is a 16 px line even with no labels", () => {
    const { container } = render(<Item task={task({ task_key: "Q4-3", task_label: "" })} value="t-1" />)
    expect(container.querySelector("[data-card-key]")!.className).toContain("h-4")
    expect(container.querySelector("[data-card-labels]")).toBeNull()
  })

  it("isn't drawn for a task that has neither a key nor a lock", () => {
    const { container } = render(<Item task={task()} value="t-1" />)
    expect(container.querySelector("[data-card-key]")).toBeNull()
  })

  // A held card (main's approvals check, gap 3): the board's read carries its
  // open request (task_waiting), and the top line says it's waiting, on a card
  // with no key too.
  it("says a held card is waiting for approval, and nothing on the rest", async () => {
    const { container } = render(<Item task={task({ task_waiting: { approval_id: "a1", to_status: "inReview" } })} value="t-1" />)
    const line = container.querySelector<HTMLElement>("[data-card-key]")!
    // The mark is a chunk of its own, as the type's glyph.
    expect((await within(line).findByTitle("Waiting for approval", {}, { timeout: 5000 })).textContent).toBe("Waiting for approval")
    cleanup()
    const { container: plain } = render(<Item task={task({ task_key: "Q4-3" })} value="t-1" />)
    expect(plain.querySelector("[title='Waiting for approval']")).toBeNull()
  })
})
