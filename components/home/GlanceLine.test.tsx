import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { GlanceLine, glanceLoading } from "@/components/home/GlanceLine"

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

  // Every count reads 0 until the sidebar arrives: a first visit was told
  // "All caught up." over a backlog.
  it("holds the line's place, saying nothing, while the counts aren't in", () => {
    const { container } = render(<GlanceLine loading items={[item(0, "channel"), item(0, "task")]} />)
    expect(container.textContent).not.toContain("All caught up")
    expect(screen.getByRole("status", { name: "Counting what's new" })).toBeTruthy()
  })
})

describe("glanceLoading", () => {
  it("waits for the sidenav answer", () => {
    expect(glanceLoading(undefined, {})).toBe(true)
  })
  it("waits the one render between the answer and the store", () => {
    expect(glanceLoading({ user_channels: [{}], user_dms: [] }, { userChannels: [], userChats: [] })).toBe(true)
    expect(glanceLoading({ user_channels: [{}], user_dms: [] }, { userChannels: [{}], userChats: [] })).toBe(false)
  })
  it("is ready at once for a member with no channels or messages", () => {
    expect(glanceLoading({ user_channels: [], user_dms: [] }, { userChannels: [], userChats: [] })).toBe(false)
  })
})
