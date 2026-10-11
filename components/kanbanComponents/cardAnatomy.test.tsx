import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

vi.mock("react-redux", () => ({ useDispatch: () => vi.fn(), useSelector: () => undefined }))
vi.mock("@/components/task/PRStatusBadge", () => ({ GitHubBadgeGroup: () => null }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { Item } from "@/components/kanbanComponents/Item/Item"
import { BoardActionsContext, type BoardActions } from "@/components/kanbanComponents/boardActions"
import type { TaskInfoInterface } from "@/types/task"

afterEach(cleanup)

/**
 * A board card's anatomy (design v3, work.md W21): raised, resting (e1), r10;
 * the title at 510; at most two label chips, neutral with a dot (never a
 * tinted pill); the priority glyph, never a dot and a word; on My Tasks, its
 * project's 3px edge and tile.
 */
const task = (over: Partial<TaskInfoInterface> = {}) =>
  ({
    task_uuid: "t-1",
    task_name: "Write the launch announcement",
    task_status: "inProgress",
    task_priority: "high",
    task_label: "Launch, Copy, Legal, Video",
    task_due_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_comment_count: 0,
    task_sub_task_count: 0,
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
    ...over,
  }) as unknown as TaskInfoInterface

const card = (t: TaskInfoInterface, actions?: Partial<BoardActions>) =>
  render(
    actions ? (
      <BoardActionsContext.Provider value={{ columns: () => [], moveTo: () => {}, canMove: () => true, crossProject: false, ...actions }}>
        <Item task={t} value={t.task_uuid} />
      </BoardActionsContext.Provider>
    ) : (
      <Item task={t} value={t.task_uuid} />
    ),
  ).container

describe("a board card", () => {
  it("is raised and resting at r10, with its title at 510", () => {
    const el = card(task()).querySelector<HTMLElement>("[data-cypress='draggable-item']")!
    expect(el.className).toContain("rounded-[10px]")
    expect(el.className).toContain("bg-raised")
    expect(el.className).toContain("shadow-e1")
    expect(el.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(el.querySelector("[data-card-title]")!.className).toContain("font-[510]")
  })

  it("shows at most two labels as dot chips, then +N, with no tinted pill", () => {
    const labels = card(task()).querySelector("[data-card-labels]")!
    expect(labels.querySelectorAll("[data-chip-dot]")).toHaveLength(2)
    expect(labels.textContent).toContain("+2")
    for (const chip of labels.querySelectorAll<HTMLElement>("[data-chip]")) expect(chip.className).not.toMatch(/bg-camp|bg-\w+-\d00/)
  })

  it("draws priority as its glyph, never a dot and a word", () => {
    const el = card(task())
    expect(el.querySelector("[data-priority-glyph='3']")).not.toBeNull()
    expect(el.textContent).not.toContain("High")
  })

  it("on My Tasks wears its project's edge and tile", () => {
    const el = card(task(), { crossProject: true })
    expect(el.querySelector("[data-project-edge]")).not.toBeNull()
    expect(el.querySelector("[data-card-project] [data-project-tile='16']")).not.toBeNull()
    cleanup()
    const plain = card(task(), { crossProject: false })
    expect(plain.querySelector("[data-project-edge]")).toBeNull()
  })

  it("shows a finished card's glyph and quiets its title", () => {
    const el = card(task({ task_status: "done" }))
    expect(el.querySelector("[data-card-done-glyph] [data-status-glyph='done']")).not.toBeNull()
    expect(el.querySelector("[data-card-title]")!.className).toContain("text-ink-3")
  })
})
