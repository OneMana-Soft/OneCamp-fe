import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

/**
 * The line under a project's name loads in three pieces (the glance, the
 * health, the goal). It wrapped as the goal arrived whenever a side panel made
 * the page narrow, and everything under it moved down 28px: a layout shift of
 * 0.075 opening a project with a thread open. jsdom lays nothing out, so this
 * holds the shape that prevents it: one line, one chip high from the first
 * paint, never wrapping, with the goal's name giving way first.
 */
const data = vi.hoisted(() => ({ loaded: false }))
const day = new Date(Date.now() - 2 * 864e5).toISOString()

vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => {
    if (!data.loaded || !key) return { data: undefined, isLoading: true }
    if (key.includes("taskListForKanban"))
      return { data: { data: { project_tasks_todo: [{ task_uuid: "t1", task_name: "Review the pricing page copy", task_status: "todo" }], project_tasks_done_count: 3 } } }
    if (key.includes("/updates")) return { data: { data: { updates: [{ id: "u1", health: "on_track", body: "Fine", created_at: day }], can_post: true } } }
    if (key.includes("goal")) return { data: { data: { goals: [{ id: "g1", title: "Launch the Business tier to every agency on the waitlist", progress: 0.4 }] } } }
    return { data: undefined }
  },
}))

const { ProjectHeaderLine } = await import("@/components/project/ProjectHeaderLine")

afterEach(() => {
  cleanup()
  data.loaded = false
})

const lineOf = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-project-line]")!

describe("the line under a project's name", () => {
  it("is one chip high and one line from the first paint, before anything has loaded", () => {
    const { container } = render(<ProjectHeaderLine projectId="p" onOpenUpdates={() => {}} />)
    const line = lineOf(container)
    expect(line.className).toContain("h-[1.375rem]")
    expect(line.className).not.toMatch(/flex-wrap/)
    expect(line.children.length).toBeGreaterThan(0)
  })

  it("keeps that shape once the glance, the health and the goal are in, and gives way goal first", () => {
    data.loaded = true
    const { container, getByText, getByRole } = render(<ProjectHeaderLine projectId="p" onOpenUpdates={() => {}} />)
    const line = lineOf(container)
    expect(line.className).toContain("h-[1.375rem]")
    expect(line.className).not.toMatch(/flex-wrap/)
    // The glance truncates; the health never shrinks; the goal shrinks first.
    const glance = line.firstElementChild as HTMLElement
    expect(glance.className).toMatch(/\bmin-w-0\b/)
    expect(glance.className).toMatch(/\btruncate\b/)
    const health = getByText(/On track/).closest("button")!
    expect(health.className).toMatch(/\bshrink-0\b/)
    expect(health.className).toMatch(/\bwhitespace-nowrap\b/)
    const goal = getByRole("link")
    expect(goal.className).toMatch(/\bmin-w-0\b/)
    expect(goal.className).toContain("shrink-[4]")
    expect(goal.textContent).toContain("Launch the Business tier")
  })

  it("is the line the project page draws", () => {
    const page = readFileSync(join(process.cwd(), "components/project/projectTaskDesktop.tsx"), "utf8")
    expect(page).toContain("<ProjectHeaderLine")
    expect(page).not.toMatch(/flex-wrap[^"]*"\s*>\s*<ProjectGlanceLine/)
  })
})
