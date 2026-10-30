import { describe, expect, it } from "vitest"
import { checkInEvents, tasksAhead, type RepeatsView } from "./repeats"
import { checkInChannel, repeatsPath, taskOfAhead } from "./repeatsPath"
import { pinTestClock } from "@/lib/testing/testClock"
import { hueFor } from "@/lib/campHue"

pinTestClock()

const channel = "0f3a6c2e-9b1d-4e5f-8a7b-1c2d3e4f5a6b"
const view: RepeatsView = {
  checkins: [{ id: "c1", channel_uuid: channel, channel_name: "engineering", question: "What did you work on today?", at: ["2026-11-02T17:00:00Z", "not a time", "2026-11-03T17:00:00Z"] }],
  tasks: [{ task_uuid: "t1", task_name: "Plan the week", project_uuid: "p1", project_name: "Ops", rule: "FREQ=WEEKLY;BYDAY=MO", due: ["2026-11-09T00:00:00Z", "2026-11-16T00:00:00Z"] }],
}

// Calendar head 9 (gcal-1b): what repeats beside the events, as the grid draws it.
describe("repeats on the grid", () => {
  it("asks for a stretch one read covers, and nothing longer or backwards", () => {
    const from = new Date("2026-11-01T00:00:00Z")
    expect(repeatsPath(from, new Date(+from + 42 * 864e5))).toBe("/calendar/repeats?from=2026-11-01T00%3A00%3A00.000Z&to=2026-12-13T00%3A00%3A00.000Z")
    expect(repeatsPath(from, new Date(+from + 62 * 864e5 + 1))).toBe("")
    expect(repeatsPath(from, from)).toBe("")
  })

  it("draws each time a check-in asks as a quarter hour nobody moves, named for its channel", () => {
    const events = checkInEvents(view)
    expect(events.map((e) => [e.event_title, e.event_start_time, e.event_end_time, e.event_read_only, e.event_description])).toEqual([
      ["#engineering check-in", "2026-11-02T17:00:00.000Z", "2026-11-02T17:15:00.000Z", true, "What did you work on today?"],
      ["#engineering check-in", "2026-11-03T17:00:00.000Z", "2026-11-03T17:15:00.000Z", true, "What did you work on today?"],
    ])
    expect(new Set(events.map((e) => e.event_uuid)).size).toBe(2)
    expect(events.every((e) => e.event_hue === hueFor(channel))).toBe(true)
    expect(events.every((e) => checkInChannel(e.event_uuid) === channel)).toBe(true)
    expect(checkInEvents(undefined)).toEqual([])
  })

  it("knows a check-in's channel from its id, and nothing else's", () => {
    expect(checkInChannel("e1")).toBeNull()
    expect(checkInChannel("gcal-123")).toBeNull()
    expect(checkInChannel("checkin-nope")).toBeNull()
  })

  it("draws each date a repeating task comes due next as that task, marked ahead", () => {
    const tasks = tasksAhead(view)
    expect(tasks.map((t) => [t.task_uuid, t.task_name, t.task_due_date, t.task_ahead, t.task_project?.project_name])).toEqual([
      ["t1@2026-11-09T00:00:00Z", "Plan the week", "2026-11-09T00:00:00Z", true, "Ops"],
      ["t1@2026-11-16T00:00:00Z", "Plan the week", "2026-11-16T00:00:00Z", true, "Ops"],
    ])
    expect(tasks.map((t) => taskOfAhead(t.task_uuid))).toEqual(["t1", "t1"])
    expect(taskOfAhead("t1")).toBe("t1")
    expect(tasksAhead(undefined)).toEqual([])
  })
})
