import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

/** "What needs me now" (hub.md H8–H10): one queue, grouped, acting in place. */
const celebrateOnce = vi.fn(() => 1)
vi.mock("@/lib/celebrate", async (orig) => ({ ...(await orig<typeof import("@/lib/celebrate")>()), celebrateOnce, prefersReducedMotion: () => true }))
// A DM partner who is a bot: OneCamp AI is an AI bot, the check-in bot is not.
vi.mock("@/hooks/useBotKinds", () => ({ useBotKind: (id?: string, isBot?: boolean) => (isBot ? (id === "u-ai" ? "assistant" : "checkin") : undefined) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
// The shared toast, read back: what it says and the Undo it offers.
type Toasted = { title?: string; description?: string; action?: { props: { onClick: () => void; altText?: string } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }) }))

const { NeedsMeSection } = await import("@/components/home/NeedsMeSection")
const { NeedsGoneContext, useNeedsGoneState } = await import("@/components/home/needsGone")
const { GlanceLine, glanceOf } = await import("@/components/home/GlanceLine")
const { groupNeeds, tasksToNeeds, mentionsToNeeds, dmsToNeeds } = await import("@/components/home/needsMe")
import type { NeedsItem } from "@/components/home/needsMe"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

afterEach(() => {
  cleanup()
  celebrateOnce.mockClear()
  toast.mockReset()
  vi.useRealTimers()
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
    expect(screen.getByRole("button", { name: "Show 2 more" })).toBeTruthy()
    // Labels only with two groups or more.
    expect(screen.getByText("Agent requests")).toBeTruthy()
  })

  // "See all" and "N more" linked to Inbox > Priority, which never lists a
  // task that is due: a queue of one due task linked to "You're all caught up".
  it("opens the rest in place, and offers See all only while rows are hidden", () => {
    const items = [task("1"), task("2"), mention, agent, task("3"), task("4"), task("5"), task("6")]
    const { container } = render(<NeedsMeSection items={items} />)
    expect(container.querySelector("a[href*='/app/inbox']")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "See all" }))
    expect(container.querySelectorAll("[data-needs-kind]")).toHaveLength(8)
    expect(screen.queryByRole("button", { name: /Show \d+ more/ })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }))
    expect(container.querySelectorAll("[data-needs-kind]")).toHaveLength(6)
    cleanup()
    render(<NeedsMeSection items={[task("1")]} />)
    expect(screen.queryByRole("button", { name: "See all" })).toBeNull()
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

  // OneCamp AI's unread DM led its row with an "OA" person disc on the
  // demo's Home (critic integration, 12 Oct): an agent is its square, and
  // a bot that isn't AI its neutral square, as everywhere else.
  it("leads a bot's row with its square, never a person's disc", () => {
    const dm = (id: string, name: string) => ({ dm_grouping_id: `me ${id}`, dm_unread: 1, dm_participants: [{ user_uuid: "me", user_name: "Sam" }, { user_uuid: id, user_name: name, is_bot: true }] })
    const items = dmsToNeeds([dm("u-ai", "OneCamp AI"), dm("u-checkin", "Check-in")] as never, "me")
    expect(items.map((i) => i.person?.bot)).toEqual([true, true])
    const { container } = render(<NeedsMeSection items={items} />)
    const rows = container.querySelectorAll('[data-needs-kind="reply"]')
    expect(rows[0].querySelector("[data-agent-avatar]")).not.toBeNull()
    expect(rows[1].querySelector("[data-bot-avatar]")).not.toBeNull()
    expect(container.querySelector('[data-needs-kind="reply"] [data-hue]')).toBeNull()
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

  // design-01: the shared list keys (lib/listKeys), as tasks and boards have them.
  it("moves between rows with J and K or the arrows, and opens one with Enter or O", () => {
    const opened = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {})
    const { container } = render(<NeedsMeSection items={[mention, task("1", { href: "/app/task/1" }), task("2", { href: "/app/task/2" })]} />)
    const rows = [...container.querySelectorAll<HTMLElement>("[data-needs-kind]")]
    rows[0].focus()
    fireEvent.keyDown(rows[0], { key: "j" })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2], { key: "j" })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2], { key: "k" })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: "Enter" })
    expect(opened).toHaveBeenCalledTimes(1)
    expect((opened.mock.contexts[0] as HTMLAnchorElement).getAttribute("href")).toBe("/app/task/1")
    fireEvent.keyDown(rows[1], { key: "o" })
    expect(opened).toHaveBeenCalledTimes(2)
    opened.mockRestore()
  })

  it("offers Undo after Done, which puts the task back as it was", async () => {
    const onDone = vi.fn().mockResolvedValue(undefined)
    const onUndoDone = vi.fn().mockResolvedValue(undefined)
    const one = task("1")
    const { container } = render(<NeedsMeSection items={[one, task("2")]} onDone={onDone} onUndoDone={onUndoDone} />)
    await act(async () => fireEvent.keyDown(container.querySelector('[data-needs-kind="due"]') as HTMLElement, { key: "e" }))
    expect(container.querySelectorAll("[data-needs-kind]")).toHaveLength(1)
    const said = toast.mock.calls.at(-1)![0]
    expect(said.title).toBe("Done")
    expect(said.description).toBe("Task 1")
    expect(said.action?.props.altText).toBe("Undo")
    await act(async () => said.action!.props.onClick())
    expect(onUndoDone).toHaveBeenCalledWith(one)
    expect(container.querySelectorAll("[data-needs-kind]")).toHaveLength(2)
  })

  it("holds a dismissal for the Undo's while, so Undo sends nothing", async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<NeedsMeSection items={[agent, task("1")]} onDismiss={onDismiss} />)
    const row = () => container.querySelector('[data-needs-kind="agent"]') as HTMLElement | null
    await act(async () => fireEvent.keyDown(row()!, { key: "d" }))
    expect(row()).toBeNull()
    expect(onDismiss).not.toHaveBeenCalled()
    await act(async () => toast.mock.calls.at(-1)![0].action!.props.onClick())
    expect(row()).not.toBeNull()
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(onDismiss).not.toHaveBeenCalled()
    // Dismissed and left alone: told once the Undo has gone.
    await act(async () => fireEvent.keyDown(row()!, { key: "d" }))
    await act(async () => void vi.advanceTimersByTime(10_000))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("tells the server of a held dismissal when Home goes away first", async () => {
    vi.useFakeTimers()
    const onDismiss = vi.fn().mockResolvedValue(undefined)
    const { container, unmount } = render(<NeedsMeSection items={[agent]} onDismiss={onDismiss} />)
    await act(async () => fireEvent.keyDown(container.querySelector('[data-needs-kind="agent"]') as HTMLElement, { key: "d" }))
    unmount()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it("offers no Undo after Approve: the agent has acted", async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined)
    const { container } = render(<NeedsMeSection items={[agent]} onApprove={onApprove} />)
    await act(async () => fireEvent.keyDown(container.querySelector('[data-needs-kind="agent"]') as HTMLElement, { key: "a" }))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls.some(([t]) => t.action)).toBe(false)
  })

  // The greeting's line above said "1 overdue" after the overdue task was
  // done (DESIGN-BUILD-3): Home's line and its list read one state.
  it("takes a done task off the greeting's count, and Undo puts it back", async () => {
    const onDone = vi.fn().mockResolvedValue(undefined)
    const onUndoDone = vi.fn().mockResolvedValue(undefined)
    const items = [task("1", { overdue: true }), task("2")]
    function Home() {
      const page = useNeedsGoneState()
      const { counts } = glanceOf(page.shown)
      return (
        <NeedsGoneContext.Provider value={page}>
          <p data-testid="line">
            {counts.tasksDue + counts.overdue} due, {counts.overdue} overdue
          </p>
          <NeedsMeSection items={items} onDone={onDone} onUndoDone={onUndoDone} />
        </NeedsGoneContext.Provider>
      )
    }
    const { container } = render(<Home />)
    expect(screen.getByTestId("line").textContent).toBe("2 due, 1 overdue")
    await act(async () => fireEvent.keyDown(container.querySelector('[data-needs-kind="due"]') as HTMLElement, { key: "e" }))
    expect(screen.getByTestId("line").textContent).toBe("1 due, 0 overdue")
    await act(async () => toast.mock.calls.at(-1)![0].action!.props.onClick())
    expect(screen.getByTestId("line").textContent).toBe("2 due, 1 overdue")
  })

  // DESIGN-BUILD-3 (21 Oct 2026): the line counted "1 task · 1 mention" over
  // the list's loading rows. The list tells the page what it shows, and the
  // line says that: it waits while the list does, and it never says nothing
  // needs you over a row in the list.
  it("keeps the line waiting while the list draws its loading rows, then says what the list shows", () => {
    const next = { title: "Launch sync", time: "11:00" }
    function Home({ items, loading = false }: { items: NeedsItem[]; loading?: boolean }) {
      const page = useNeedsGoneState()
      const g = glanceOf(page.shown)
      return (
        <NeedsGoneContext.Provider value={page}>
          <GlanceLine loading={g.loading} failed={g.failed} counts={g.counts} unnamed={g.unnamed} next={next} />
          <NeedsMeSection items={items} loading={loading} />
        </NeedsGoneContext.Provider>
      )
    }
    const view = render(<Home items={[mention, task("1")]} loading />)
    expect(screen.getByRole("status", { name: "Counting what needs you" })).toBeTruthy()
    view.rerender(<Home items={[mention, task("1")]} />)
    expect(document.querySelector("[data-glance]")?.textContent).toBe("1 task due today · 1 mention waiting · Next: Launch sync at 11:00")
    // A DM waiting, which the line leaves to the list: never "Nothing needs you".
    const dm: NeedsItem = { id: "dm:g1", kind: "reply", title: "Maya Chen", person: { id: "u-maya", name: "Maya Chen" } }
    view.rerender(<Home items={[dm]} />)
    expect(document.querySelector("[data-glance]")?.textContent).toBe("Next up: Launch sync at 11:00.")
    view.rerender(<Home items={[]} />)
    expect(document.querySelector("[data-glance]")?.textContent).toBe("Nothing needs you. Next up: Launch sync at 11:00.")
  })

  // At 390 the mention's title lost its channel ("#en…") and its words ended
  // "Thurs…" at 1280: both take up to two lines.
  it("lets a task's title take two lines, as a mention's does", () => {
    const { container } = render(<NeedsMeSection items={[task("1", { title: "Write the launch announcement for the press" })]} />)
    const title = container.querySelector('[data-needs-kind="due"] [data-hub-title]') as HTMLElement
    expect(title.className.split(" ")).toContain("line-clamp-2")
  })

  it("lets a mention's title and words take two lines", () => {
    const { container } = render(<NeedsMeSection items={[mention]} onReply={vi.fn()} />)
    const row = container.querySelector('[data-needs-kind="reply"]') as HTMLElement
    const title = screen.getByText(mention.title).closest("[data-hub-title]") as HTMLElement
    const words = row.querySelector("[data-hub-second]") as HTMLElement
    for (const el of [title, words]) {
      expect(el.className.split(" ")).toContain("line-clamp-2")
      expect(el.className.split(" ")).not.toContain("truncate")
    }
  })

  // "Reply R" offered an R on a phone with no keyboard: key hints carry the
  // shared rule's mark (app/globals.css), which hides them there.
  it("marks its key hints for the shared rule that hides them without a keyboard", async () => {
    const { container } = render(<NeedsMeSection items={[mention]} onReply={vi.fn()} />)
    const r = screen.getByRole("button", { name: /Reply/ }).querySelector(".kbd") as HTMLElement
    expect(r.hasAttribute("data-kbd-hint")).toBe(true)
    await act(async () => fireEvent.keyDown(container.querySelector('[data-needs-kind="reply"]') as HTMLElement, { key: "r" }))
    expect(screen.getByText("↵ send · Esc close").hasAttribute("data-kbd-hint")).toBe(true)
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
    // The status each was in, as the task list keeps it, for Done's Undo.
    expect(tasks.map((t) => t.statusValue)).toEqual(["todo", "inprogress"])
    const custom = tasksToNeeds([{ task_uuid: "t5", task_name: "Proof", task_status: "inprogress", task_custom_status: "cs-proof", task_due_date: now.toISOString() }] as never, now)
    expect(custom[0].statusValue).toBe("cs-proof")
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

describe("an approval waiting for me", () => {
  it("links to its item and says what is asked, by when and where, leaving the answer to the item's card", () => {
    const row: NeedsItem = {
      id: "approval:a1", kind: "approval", title: "Launch copy", quote: "Is the copy final?", person: { id: "u-cy", name: "Cy Park" },
      due: "Was due 22 Oct", overdue: true, project: { id: "p1", name: "Q4 launch" }, href: "/app/task/t1", taskUuid: "t1", projectUuid: "p1",
    }
    // Groups are labelled once there are two of them.
    render(<NeedsMeSection items={[row, task("1")]} />)
    expect(screen.getByText("Approvals")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Launch copy" }).getAttribute("href")).toBe("/app/task/t1")
    const shown = document.querySelector('[data-needs-kind="approval"]')!
    expect(shown.textContent).toContain("Is the copy final?")
    expect(shown.textContent).toContain("Was due 22 Oct")
    expect(shown.textContent).toContain("Q4 launch")
    expect(shown.querySelector("button")).toBeNull()
  })
})
