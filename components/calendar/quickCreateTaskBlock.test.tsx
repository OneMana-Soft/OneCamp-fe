import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { pinTestClock } from "@/lib/testing/testClock"

// Block time from a slot (calendar B1 step 6, gcal-new-task-blocks): quick
// create picks one of your tasks, and Save makes time for it on the grid
// through the calendar's one block write (calendarApp's blockTime), which the
// task-lane drag uses too. A block is yours alone: no guests, not focus.

const makeRequest = vi.fn(async () => ({}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest, isSubmitting: false }) }))
let storeOn = true
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_CALENDAR_REPEATS: "calendar_repeats", useFeature: () => storeOn }))

const BRIEF = {
  task_uuid: "t-brief",
  task_name: "Write the launch brief",
  task_status: "inProgress",
  task_project: { project_uuid: "p-launch", project_name: "Launch" },
}
// The finder is a chunk of its own; here it offers one task.
vi.mock("@/components/task/taskFinder", () => ({
  TaskFinder: ({ onPick }: { onPick: (t: typeof BRIEF) => void }) => (
    <button type="button" onClick={() => onPick(BRIEF)}>
      pick the brief
    </button>
  ),
}))

import { QuickCreateCard } from "./quickCreateCard"

pinTestClock()

afterEach(() => {
  cleanup()
  makeRequest.mockClear()
  storeOn = true
})

// The card's hour, the afternoon of the pinned day.
const DRAFT = { start: new Date(2026, 9, 15, 14), end: new Date(2026, 9, 15, 15) }

function card(onBlockTime = vi.fn(async () => true)) {
  const anchor = document.createElement("div")
  document.body.appendChild(anchor)
  const on = { close: vi.fn(), created: vi.fn(), more: vi.fn(), block: onBlockTime }
  render(
    <QuickCreateCard
      draft={DRAFT}
      anchor={anchor}
      onDraftChange={vi.fn()}
      onClose={on.close}
      onCreated={on.created}
      onMoreOptions={on.more}
      onBlockTime={on.block}
    />,
  )
  return on
}
const pickTheBrief = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Block time for a task" }))
  fireEvent.click(await screen.findByRole("button", { name: "pick the brief" }))
}
const TASK = { task_uuid: "t-brief", task_name: "Write the launch brief", task_status: "inProgress", project_uuid: "p-launch", project_name: "Launch" }

describe("block time from a slot", () => {
  it("makes time for the task picked, at the slot, and no event", async () => {
    const on = card()
    await pickTheBrief()
    // The card is the block's now: its task, and nothing a block can't have.
    expect(screen.getByRole("button", { name: "Time for Write the launch brief. Change the task" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Add guests/ })).toBeNull()
    expect(screen.queryByRole("button", { name: "Focus" })).toBeNull()
    expect(screen.getByLabelText("Event title").getAttribute("placeholder")).toBe("Write the launch brief")
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(on.block).toHaveBeenCalledTimes(1))
    expect(on.block).toHaveBeenCalledWith(TASK, DRAFT.start, DRAFT.end, "")
    await waitFor(() => expect(on.close).toHaveBeenCalled())
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("names the block with what was typed", async () => {
    const on = card()
    await pickTheBrief()
    fireEvent.change(screen.getByLabelText("Event title"), { target: { value: "Outline the brief" } })
    fireEvent.submit(screen.getByLabelText("Event title").closest("form")!)
    await waitFor(() => expect(on.block).toHaveBeenCalledWith(TASK, DRAFT.start, DRAFT.end, "Outline the brief"))
  })

  it("stays open when the block isn't made", async () => {
    const on = card(vi.fn(async () => false))
    await pickTheBrief()
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }))
    await waitFor(() => expect(on.block).toHaveBeenCalled())
    expect(on.close).not.toHaveBeenCalled()
  })

  it("carries the task into More options", async () => {
    const on = card()
    await pickTheBrief()
    fireEvent.click(screen.getByRole("button", { name: "More options" }))
    expect(on.more).toHaveBeenCalledWith(expect.objectContaining({ task: TASK, start: DRAFT.start, end: DRAFT.end, guests: [] }))
  })

  it("is an event again once the task is taken off", async () => {
    card()
    await pickTheBrief()
    fireEvent.click(screen.getByRole("button", { name: "Not for a task" }))
    expect(screen.getByRole("button", { name: /Add guests/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Block time for a task" })).toBeTruthy()
  })

  it("isn't offered where the calendar can't keep a block", () => {
    storeOn = false
    card()
    expect(screen.queryByRole("button", { name: "Block time for a task" })).toBeNull()
  })
})
