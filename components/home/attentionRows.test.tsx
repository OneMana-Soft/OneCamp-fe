import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

/** "What needs me now" (hub.md H8–H10): one queue, grouped, acting in place. */
const celebrateOnce = vi.fn(() => 1)
vi.mock("@/lib/celebrate", async (orig) => ({ ...(await orig<typeof import("@/lib/celebrate")>()), celebrateOnce, prefersReducedMotion: () => true }))

const { NeedsMeSection } = await import("@/components/home/NeedsMeSection")
const { groupNeeds, tasksToNeeds, mentionsToNeeds } = await import("@/components/home/needsMe")
import type { NeedsItem } from "@/components/home/needsMe"

afterEach(() => {
  cleanup()
  celebrateOnce.mockClear()
})

const task = (id: string, extra: Partial<NeedsItem> = {}): NeedsItem => ({ id: `task:${id}`, kind: "due", title: `Task ${id}`, status: "todo", due: "Due today", taskUuid: id, ...extra })
const agent: NeedsItem = { id: "ai:approval:p1", kind: "agent", title: "Release Captain wants to create 6 tasks", context: "in Q4 launch", refId: "p1" }
const mention: NeedsItem = { id: "mention:post1", kind: "reply", title: "Jonas mentioned you in #engineering", quote: "@You can we get the rollback steps", person: { id: "u-jonas", name: "Jonas Weber" }, postUuid: "post1" }

describe("grouping", () => {
  it("orders agent requests, replies, due, email, and caps at six with a 'more' row", () => {
    const items = [task("1"), task("2"), mention, agent, task("3"), task("4"), task("5"), task("6")]
    const { groups, more } = groupNeeds(items)
    expect(groups.map((g) => g.kind)).toEqual(["agent", "reply", "due"])
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(6)
    expect(more).toBe(2)
    render(<NeedsMeSection items={items} />)
    expect(screen.getByText("2 more")).toBeTruthy()
    // Labels only with two groups or more.
    expect(screen.getByText("Agent requests")).toBeTruthy()
  })

  it("is no card: no ai-panel or bordered wrapper", () => {
    const { container } = render(<NeedsMeSection items={[task("1")]} />)
    const html = container.innerHTML
    expect(html).not.toMatch(/ai-panel/)
    expect(container.querySelector("[data-needs-me]")!.className).not.toMatch(/border/)
    expect(screen.queryByText("Due")).toBeNull()
  })

  it("leads each kind with its own mark: agent square, author avatar, status glyph", () => {
    const { container } = render(<NeedsMeSection items={[agent, mention, task("1")]} />)
    expect(container.querySelector('[data-needs-kind="agent"] [data-agent-avatar]')).not.toBeNull()
    expect(container.querySelector('[data-needs-kind="reply"] [data-hue]')).not.toBeNull()
    expect(container.querySelector('[data-needs-kind="due"] svg')).not.toBeNull()
    // "@You" is the brand-muted mention chip.
    expect(screen.getByText("@You").className).toContain("hub-me")
  })
})

describe("acting in place", () => {
  it("says a failed approval on the row, with Retry, and keeps the row", async () => {
    const onApprove = vi.fn().mockRejectedValue(new Error("you are not a member of #drill-finance"))
    render(<NeedsMeSection items={[agent]} onApprove={onApprove} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })))
    expect(screen.getByRole("alert").textContent).toContain("Couldn't approve: you are not a member of #drill-finance")
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy()
    expect(screen.getByText(agent.title)).toBeTruthy()
  })

  it("fires E, R, A and D only with the row itself focused", async () => {
    const onDone = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<NeedsMeSection items={[task("1")]} onDone={onDone} />)
    const row = container.querySelector('[data-needs-kind="due"]') as HTMLElement
    fireEvent.keyDown(row.querySelector("a,button") ?? document.body, { key: "e" })
    expect(onDone).not.toHaveBeenCalled()
    await act(async () => fireEvent.keyDown(row, { key: "e" }))
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("celebrates once, only when the last row is cleared in this session", async () => {
    const empty = render(<NeedsMeSection items={[]} />)
    expect(screen.getByText("Nothing needs you right now")).toBeTruthy()
    expect(celebrateOnce).not.toHaveBeenCalled()
    empty.unmount()
    const onDone = vi.fn().mockResolvedValue(undefined)
    render(<NeedsMeSection items={[task("1")]} onDone={onDone} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Done" })))
    expect(screen.getByText("All clear. Nice work.")).toBeTruthy()
    expect(celebrateOnce).toHaveBeenCalledWith("needs-me", expect.anything(), expect.anything())
  })
})

describe("without AI", () => {
  const now = new Date(2026, 9, 11, 10)
  it("still lists mentions waiting and tasks due", () => {
    const tasks = tasksToNeeds(
      [
        { task_uuid: "t1", task_name: "Write the launch announcement", task_status: "inprogress", task_due_date: new Date(2026, 9, 11, 17).toISOString(), task_project: { project_uuid: "q4", project_name: "Q4 launch" } },
        { task_uuid: "t2", task_name: "Book the retro", task_status: "todo", task_due_date: new Date(2026, 9, 9).toISOString() },
        { task_uuid: "t3", task_name: "Done one", task_status: "done", task_due_date: new Date(2026, 9, 9).toISOString() },
        { task_uuid: "t4", task_name: "Next week", task_status: "todo", task_due_date: new Date(2026, 9, 19).toISOString() },
      ] as never,
      now,
    )
    expect(tasks.map((t) => [t.title, t.overdue])).toEqual([
      ["Book the retro", true],
      ["Write the launch announcement", false],
    ])
    const mentions = mentionsToNeeds(
      [
        {
          activity_type: "MENTION",
          time: new Date(2026, 9, 11, 9).toISOString(),
          priority: "high",
          mention: { mention_post: { post_uuid: "p", post_text: '<span data-id="me@0x1">@Sam</span> look', post_channel: { ch_uuid: "c", ch_name: "engineering" }, post_by: { user_uuid: "u-jonas", user_full_name: "Jonas Weber" } } },
        },
      ] as never,
      "me",
      now,
    )
    expect(mentions[0]).toMatchObject({ title: "Jonas mentioned you in #engineering", quote: "@You look" })
  })
})
