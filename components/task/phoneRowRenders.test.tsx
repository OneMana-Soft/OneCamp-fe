import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

import type { TaskInfoInterface } from "@/types/task"

// fluid-17's budget for a phone list's scroll (FLUIDITY-LEAD-2, 21 Oct): its
// renders come from rows entering (about 10,400 a scroll of some 380 rows
// on a 4x phone), so a row is held to the components it mounts, counted as
// the harness counts them (scripts/fluidity/lib.mjs: React DevTools' hook; a
// function, class, forwardRef or memo component that performed work).
const tally = vi.hoisted(() => {
  const COMPONENT = new Set([0, 1, 11, 14, 15])
  type Fiber = { tag: number; flags: number; child: Fiber | null; sibling: Fiber | null; alternate: Fiber | null }
  const t = { renders: 0 }
  const mount = (f: Fiber) => {
    if (COMPONENT.has(f.tag)) t.renders++
    for (let c = f.child; c; c = c.sibling) mount(c)
  }
  const update = (next: Fiber, prev: Fiber) => {
    if (COMPONENT.has(next.tag) && next.flags & 1) t.renders++
    if (next.child === prev.child) return
    for (let c = next.child; c; c = c.sibling) {
      if (c.alternate) update(c, c.alternate)
      else mount(c)
    }
  }
  ;(globalThis as Record<string, unknown>).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject: () => 1,
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id: number, root: { current: Fiber }) {
      const next = root.current
      if (next.alternate) update(next, next.alternate)
      else mount(next)
    },
  }
  return t
})

vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { TaskListTask } from "@/components/task/taskListTask"

afterEach(cleanup)

const task = (i: number) =>
  ({
    task_uuid: `t-${i}`,
    task_name: `Task ${i}`,
    task_status: "todo",
    task_priority: "medium",
    task_label: "launch",
    task_due_date: new Date(Date.now() + 3 * 86400000).toISOString(),
    task_comment_count: 2,
    task_sub_task_count: 0,
    task_assignee: { user_uuid: "u-1", user_name: "maya", user_full_name: "Maya Chen", user_profile_object_key: "" },
    task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
  }) as unknown as TaskInfoInterface

describe("a phone list's rows", () => {
  it("mount at most 23 components each", () => {
    // The harness's phone list row: a todo with a priority, a tag, a due date,
    // comments and an assignee without a photo.
    const N = 20
    render(
      <>
        {Array.from({ length: N }, (_, i) => (
          <TaskListTask key={i} taskInfo={task(i)} onToggleStatus={() => {}} isAdmin isAnimating={false} showProject={false} />
        ))}
      </>,
    )
    const perRow = tally.renders / N
    console.log(`renders per row mounted: ${perRow}`)
    // Before fluid-17's part 2 a row mounted 29: the swipe layer's three icons
    // (two components each), the GitHub badges' box and both of its badges.
    expect(perRow).toBeLessThanOrEqual(23)
  })
})
