import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"

import type { TaskInfoInterface } from "@/types/task"

vi.mock("@/lib/celebrate", () => ({ celebrateTask: () => 8, prefersReducedMotion: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
// The prefetch a link asks Next for, on the anchor.
vi.mock("next/link", () => ({
  default: ({ prefetch, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) => (
    <a data-next-prefetch={String(prefetch)} {...(rest as object)}>{children}</a>
  ),
}))
// The photos asked for, by profile key (no request leaves a test).
const photos = vi.hoisted(() => ({ asked: [] as unknown[] }))
vi.mock("@/hooks/useUserAvatar", () => ({
  useUserAvatar: (key?: string | null) => {
    photos.asked.push(key)
    return { src: key ? `https://files.test/${key}` : undefined, isExternalURL: false, isLoading: false }
  },
}))

import { TaskListTask } from "@/components/task/taskListTask"
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge"
import { installPointerEvent } from "@/lib/testing/pointerEvent"

afterEach(() => {
  cleanup()
  photos.asked = []
})

installPointerEvent()

// fluid-17 (FLUIDITY-LEAD's named run, 20 Oct, a phone at 4x): one scroll of
// a project's list mounts about 380 rows, and the frames that mount them are
// the slow ones (style 3.3 s, React 1.4 s). What a row costs is what it
// draws, so a row is held to what it shows.

const task = {
  task_uuid: "t-1",
  task_name: "Book the launch retro",
  task_status: "todo",
  task_priority: "medium",
  task_label: "launch",
  task_due_date: new Date(Date.now() + 3 * 86400000).toISOString(),
  task_comment_count: 2,
  task_sub_task_count: 0,
  task_assignee: { user_uuid: "u-1", user_name: "maya", user_full_name: "Maya Chen", user_profile_object_key: "" },
  task_project: { project_uuid: "p-1", project_name: "Q4 launch" },
} as unknown as TaskInfoInterface

const row = () => render(<TaskListTask taskInfo={task} onToggleStatus={vi.fn()} isAdmin isAnimating={false} showProject={false} />)

describe("a phone row's cost", () => {
  it("draws no swipe layer at rest: the first sideways move brings it", () => {
    const { container } = row()
    // The moss band, Due and More were 21 of the row's 53 elements, and no
    // one sees them until a finger moves the row.
    expect(container.querySelector("[data-swipe-complete], [data-swipe-actions]")).toBeNull()
    expect(container.querySelectorAll("*").length).toBeLessThanOrEqual(34)

    const el = container.querySelector("[data-swipe-row]")!
    fireEvent.pointerDown(el, { pointerType: "touch", clientX: 100, clientY: 20 })
    fireEvent.pointerMove(el, { pointerType: "touch", clientX: 80, clientY: 20 })
    expect(container.querySelector("[data-swipe-complete]")).not.toBeNull()
    expect(container.querySelector("[data-swipe-actions]")!.getAttribute("aria-hidden")).toBe("true")
    expect((el as HTMLElement).style.transform).toBe("translateX(-20px)")
  })

  it("draws no completion preview on a screen without hover, where it never shows", () => {
    const media = (hover: boolean) => (q: string) => ({ matches: q === "(hover: hover)" ? hover : false, media: q, addEventListener() {}, removeEventListener() {} })
    vi.stubGlobal("matchMedia", media(false))
    try {
      const { container, unmount } = row()
      expect(container.querySelector("[data-check-preview]")).toBeNull()
      expect(container.querySelectorAll("*").length).toBeLessThanOrEqual(30)
      unmount()
      // A computer keeps it.
      vi.stubGlobal("matchMedia", media(true))
      expect(row().container.querySelector("[data-check-preview]")).not.toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("asks for no photo for a person who has none", () => {
    row()
    expect(photos.asked).toEqual([])
    const withPhoto = { ...task, task_assignee: { ...(task.task_assignee as object), user_profile_object_key: "faces/maya.png" } } as TaskInfoInterface
    render(<TaskListTask taskInfo={withPhoto} onToggleStatus={vi.fn()} isAdmin isAnimating={false} showProject={false} />)
    expect(photos.asked).toEqual(["faces/maya.png"])
  })

  it("fetches its task's page when a finger lands on it, not as it scrolls into view", () => {
    const { container } = row()
    const link = container.querySelector<HTMLAnchorElement>("a[href='/app/task/t-1']")!
    expect(link.getAttribute("data-prefetch")).toBe("off")
    expect(link.getAttribute("data-next-prefetch")).toBe("false")
    fireEvent.touchStart(link)
    expect(link.getAttribute("data-prefetch")).toBe("intent")
    // Its route only (Next's auto): a task's page in full brought the
    // editor's code (Yjs, 85 KB) into a scroll, 209-375 ms in one frame.
    expect(link.getAttribute("data-next-prefetch")).toBe("auto")
  })

  it("draws no box for GitHub when the task has no link", () => {
    expect(render(<GitHubBadgeGroup task={task} />).container.innerHTML).toBe("")
    const linked = { ...task, task_github_issue_url: "https://github.com/acme/web/issues/7", task_github_issue_number: 7 } as TaskInfoInterface
    expect(render(<GitHubBadgeGroup task={linked} />).container.textContent).toContain("acme/web#7")
  })

  it("draws no swipe layer for a scroll: an upright move never brings it", () => {
    const { container } = row()
    const el = container.querySelector("[data-swipe-row]")!
    fireEvent.pointerDown(el, { pointerType: "touch", clientX: 100, clientY: 20 })
    fireEvent.pointerMove(el, { pointerType: "touch", clientX: 102, clientY: 60 })
    fireEvent.pointerUp(el, { pointerType: "touch", clientX: 102, clientY: 60 })
    expect(container.querySelector("[data-swipe-complete], [data-swipe-actions]")).toBeNull()
  })
})
