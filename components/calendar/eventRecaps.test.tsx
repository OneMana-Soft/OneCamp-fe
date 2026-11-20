import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { EventRecordings } from "@/components/calendar/eventRecordings"
import { readArtefacts } from "@/lib/calls/callArtefacts"
import { pinTestClock } from "@/lib/testing/testClock"

afterEach(cleanup)
pinTestClock(new Date("2026-11-12T12:00:00Z"))

// gcal-new-event-notes, head B: each call of an event (and of each instance
// of its series, as the calendar answers them) shows its recap and its action
// items, to whoever may read its transcript (the server's rule: the panel
// shows only what the answer holds). Each item offers Make task, into a
// project the person picks, or its task once made.
describe("a call's recap and its action items on the event", () => {
  const body = {
    data: [
      {
        key: "EG_new", started_at: "2026-11-11T10:00:00Z", ended_at: "2026-11-11T10:30:00Z", lines: 12, recorded: true,
        recap: "**📝 Summary**\n- We ship the beta on Friday.\n\n**✅ Decisions**\n- The Business tier launches.",
        action_items: [{ text: "Send the deck", owner: "Maya", due: "2026-11-14" }, { text: "Book the room", task: "task-1" }],
      },
      { key: "sess-old", started_at: "2026-11-04T10:00:00Z", lines: 3, recorded: false },
    ],
  }
  const projects = [{ uuid: "p-1", name: "Launch" }, { uuid: "p-2", name: "Ops" }]

  it("reads each call's recap and items, keeping each item's place", () => {
    const [a, b] = readArtefacts({ data: [...body.data, { key: "x", lines: 0, action_items: [7, { text: "Ok", owner: 3 }] }] })
    expect(a.recap).toContain("We ship the beta")
    expect(a.action_items).toEqual([{ text: "Send the deck", owner: "Maya", due: "2026-11-14" }, { text: "Book the room", task: "task-1" }])
    expect(b.recap).toBeUndefined()
    expect(readArtefacts({ data: [{ key: "x", lines: 0, action_items: [7, { text: "Ok", owner: 3 }] }] })[0].action_items).toEqual([{ text: "" }, { text: "Ok" }])
  })

  it("shows the recap's words and each item with who and by when, and the made one's task", () => {
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: async () => projects }} />)
    const recap = screen.getByRole("region", { name: "Recap" })
    expect(within(recap).getByText("We ship the beta on Friday.")).toBeTruthy()
    expect(within(recap).getByText("Decisions")).toBeTruthy()
    expect(recap.textContent).not.toContain("**")
    const items = within(recap).getAllByRole("listitem").filter((li) => li.hasAttribute("data-action-item"))
    expect(items).toHaveLength(2)
    expect(items[0].textContent).toContain("Send the deck")
    expect(items[0].textContent).toContain("Maya")
    expect(items[0].textContent).toContain("Due 14 Nov")
    expect(within(items[1]).getByRole("link", { name: /Open task/ }).getAttribute("href")).toBe("/app/task/task-1")
    expect(within(items[1]).queryByRole("button", { name: /Make task/ })).toBeNull()
    // A call with no recap shows none.
    expect(screen.getAllByRole("region", { name: "Recap" })).toHaveLength(1)
  })

  it("makes an item's task in the project picked, by the item's place", async () => {
    const makeTask = vi.fn(async () => undefined)
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask, projects: async () => projects }} />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make task: Send the deck" })))
    const pick = screen.getByRole("combobox", { name: "Project for the task" })
    fireEvent.change(pick, { target: { value: "p-2" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make" })))
    expect(makeTask).toHaveBeenCalledWith("EG_new", 0, "p-2")
  })

  it("draws the project picker a finger's 44px tall on a phone and 36px from md up (F3: a native select takes no ::before)", async () => {
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(async () => undefined), projects: async () => projects }} />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make task: Send the deck" })))
    const c = screen.getByRole("combobox", { name: "Project for the task" }).className.split(/\s+/)
    expect(c).toEqual(expect.arrayContaining(["h-11", "md:h-9"]))
    expect(c.filter((k) => /^(max-sm:)?h-(9|10)$/.test(k))).toEqual([])
  })

  it("says when the projects can't be read, and offers them again", async () => {
    const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(projects)
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: list }} />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make task: Send the deck" })))
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load your projects")
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(screen.getByRole("combobox", { name: "Project for the task" })).toBeTruthy()
  })

  it("says so when the person is in no project to put it in", async () => {
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: async () => [] }} />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make task: Send the deck" })))
    expect(screen.getByText("You're in no project to add it to.")).toBeTruthy()
  })

  // Look F1 (DESIGN-BUILD-146): each step removes the control that had the keys' focus, so the next one takes it,
  // never <body>.
  describe("keeps the keys' focus on the item through each step", () => {
    const makeButton = () => screen.getByRole("button", { name: "Make task: Send the deck" })
    const press = async (el: HTMLElement) => {
      el.focus()
      await act(async () => void fireEvent.click(el))
    }

    it("opens the pick on its select, and Cancel gives it back to Make task", async () => {
      render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: async () => projects }} />)
      await press(makeButton())
      expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Project for the task" }))
      await press(screen.getByRole("button", { name: "Cancel" }))
      expect(document.activeElement).toBe(makeButton())
    })

    it("holds Make task while the projects are read", async () => {
      let done!: (l: typeof projects) => void
      render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: () => new Promise((r) => (done = r)) }} />)
      await press(makeButton())
      expect(document.activeElement).toBe(makeButton())
      expect(makeButton().getAttribute("aria-busy")).toBe("true")
      await act(async () => done(projects))
      expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Project for the task" }))
    })

    it("puts it on Try again when the read fails, and on the select once it reads", async () => {
      const list = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(projects)
      render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: list }} />)
      await press(makeButton())
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Try again" }))
      await press(screen.getByRole("button", { name: "Try again" }))
      expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "Project for the task" }))
    })

    it("puts it on Close when there's no project, and Close gives it back to Make task", async () => {
      render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask: vi.fn(), projects: async () => [] }} />)
      await press(makeButton())
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }))
      await press(screen.getByRole("button", { name: "Close" }))
      expect(document.activeElement).toBe(makeButton())
    })

    it("moves it to the made task's link once the item carries its task", async () => {
      const recap = { makeTask: vi.fn(async () => undefined), projects: async () => projects }
      const { rerender } = render(<EventRecordings body={body} onPlay={vi.fn()} recap={recap} />)
      await press(makeButton())
      await press(screen.getByRole("button", { name: "Make" }))
      const [call, old] = body.data
      const made = { data: [{ ...call, action_items: [{ ...call.action_items![0], task: "task-9" }, call.action_items![1]] }, old] }
      await act(async () => void rerender(<EventRecordings body={made} onPlay={vi.fn()} recap={recap} />))
      expect(document.activeElement).toBe(screen.getByRole("link", { name: "Open task: Send the deck" }))
    })
  })

  // F2 (CODE-REVIEWER-277): the server refuses the task; the request's own toast says why (makeRequest), and
  // the item keeps its picker, Make no longer busy and still holding the keys' focus, with no task.
  it("keeps the picker when the server refuses the task", async () => {
    const makeTask = vi.fn(async () => {
      throw new Error("You can't add tasks to that project")
    })
    render(<EventRecordings body={body} onPlay={vi.fn()} recap={{ makeTask, projects: async () => projects }} />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Make task: Send the deck" })))
    const make = screen.getByRole("button", { name: "Make" })
    make.focus()
    await act(async () => void fireEvent.click(make))
    expect(makeTask).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("combobox", { name: "Project for the task" })).toBeTruthy()
    expect(make.getAttribute("aria-busy")).toBeNull()
    expect(document.activeElement).toBe(make)
    expect(screen.queryByRole("link", { name: "Open task: Send the deck" })).toBeNull()
  })

  it("offers no Make task without the means (a reader who may not change the event)", () => {
    render(<EventRecordings body={body} onPlay={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Make task/ })).toBeNull()
    expect(screen.getByText("Send the deck")).toBeTruthy()
  })
})
