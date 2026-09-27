import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GlanceLine } from "@/components/home/GlanceLine"

/**
 * The glance line replaced four stat tiles that mostly read 0. The two ways it
 * can regress into that again: printing zeros, or printing nothing at all when
 * the workspace is quiet, which reads as a page that failed to load.
 */
const item = (count: number, one: string, flag?: string) => ({ count, one, many: one + "s", href: "/app/" + one, flag })

afterEach(cleanup)

describe("GlanceLine", () => {
  it("leaves out zeros and pluralises the rest", () => {
    const { container } = render(<GlanceLine items={[item(0, "channel"), item(1, "message"), item(3, "task", "1 overdue")]} />)
    expect(container.textContent).toBe("1 message · 3 tasks, 1 overdue")
    expect(screen.getByText("tasks", { exact: false }).closest("a")?.getAttribute("href")).toBe("/app/task")
  })

  it("says so when everything is zero", () => {
    const { container } = render(<GlanceLine items={[item(0, "channel"), item(0, "task")]} />)
    expect(container.textContent).toBe("All caught up.")
  })
})
