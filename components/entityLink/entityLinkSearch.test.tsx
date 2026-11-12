import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The one search a link is picked from (the task panel's docs and boards, an event's Linked row): the workspace
// search, offering the kinds its caller links, so an event links a task through it too (EVLINK head B, gcal-15).

const { makeRequest } = vi.hoisted(() => ({ makeRequest: vi.fn() }))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))

import { EntityLinkSearch } from "@/components/entityLink/EntityLinkSearch"

afterEach(() => {
  cleanup()
  makeRequest.mockReset()
})

const FOUND = {
  page: [
    { type: "task", task: { task_id: "t1", task_name: "Book the venue" } },
    { type: "doc", doc: { doc_uuid: "d1", doc_title: "Venue brief" } },
    { type: "project", project: { project_id: "p1", project_name: "Venue hunt" } },
  ],
}

describe("the entity-link search", () => {
  it("offers a task beside docs and boards when its caller links tasks, and says so in its words", async () => {
    makeRequest.mockResolvedValueOnce(FOUND)
    const onPick = vi.fn()
    render(<EntityLinkSearch kinds={["doc", "board", "task"]} onPick={onPick} isLinked={(kind, id) => kind === "doc" && id === "d1"} />)
    expect(screen.getByText("Type to search docs, boards and tasks")).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText("Search docs, boards and tasks…"), { target: { value: "venue" } })
    // Each result says its kind on its right, in the words and muted ink the tables relation picker uses (the kind,
    // its first letter in capitals: "Task"), and the word is part of the result's name.
    const task = await screen.findByRole("button", { name: "Book the venue task" })
    expect((screen.getByRole("button", { name: "Venue brief doc" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole("button", { name: /Venue hunt/ })).toBeNull()
    expect(task.querySelector("[data-link-kind='task']")).toBeTruthy()
    expect(within(task).getByText("task").className).toMatch(/text-ink-3.*first-letter:uppercase/)
    await act(async () => fireEvent.click(task))
    expect(onPick).toHaveBeenCalledWith("task", "t1", "Book the venue")
  })

  it("tells a task from a doc of the same name by the kind in each one's name", async () => {
    makeRequest.mockResolvedValueOnce({
      page: [
        { type: "doc", doc: { doc_uuid: "d2", doc_title: "Venue" } },
        { type: "task", task: { task_id: "t2", task_name: "Venue" } },
        { type: "board", board: { board_uuid: "b2", board_title: "Venue" } },
      ],
    })
    const onPick = vi.fn()
    render(<EntityLinkSearch kinds={["doc", "board", "task"]} onPick={onPick} isLinked={() => false} />)
    fireEvent.change(screen.getByPlaceholderText("Search docs, boards and tasks…"), { target: { value: "venue" } })
    await screen.findByRole("button", { name: "Venue task" })
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Venue doc", "Venue task", "Venue board"])
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Venue task" })))
    expect(onPick).toHaveBeenCalledWith("task", "t2", "Venue")
  })

  it("says nothing matched in the words of what it finds", async () => {
    makeRequest.mockResolvedValueOnce({ page: [] })
    render(<EntityLinkSearch kinds={["doc", "board", "task"]} onPick={vi.fn()} isLinked={() => false} />)
    fireEvent.change(screen.getByPlaceholderText("Search docs, boards and tasks…"), { target: { value: "roadmap" } })
    expect(await screen.findByText("No docs, boards or tasks found")).toBeTruthy()
  })

  it("offers docs and boards alone by default, as the task panel links them", async () => {
    makeRequest.mockResolvedValueOnce(FOUND)
    render(<EntityLinkSearch onPick={vi.fn()} isLinked={() => false} />)
    fireEvent.change(screen.getByPlaceholderText("Search docs and boards…"), { target: { value: "venue" } })
    expect(await screen.findByRole("button", { name: "Venue brief doc" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Book the venue/ })).toBeNull()
  })
})
