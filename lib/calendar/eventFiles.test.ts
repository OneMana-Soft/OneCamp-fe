import { describe, expect, it } from "vitest"
import { EVENT_FILE_KINDS, MAX_EVENT_FILES, addFileRequest, filesOf, removeFileRequest, withFile, withoutFile } from "@/lib/calendar/eventFiles"

// What an event links (calendar head B, gcal-1a; EVLINK head B, gcal-15): OneCamp docs, boards and tasks by
// reference, at most 25, never a title.
const DOC = { kind: "doc", uuid: "9d1c0000-0000-4000-8000-000000000001" } as const
const BOARD = { kind: "board", uuid: "9d1c0000-0000-4000-8000-000000000002" } as const
const TASK = { kind: "task", uuid: "9d1c0000-0000-4000-8000-000000000003" } as const

describe("an event's links", () => {
  it("reads them from the event, keeping only docs, boards and tasks named by id", () => {
    expect(filesOf({ files: [DOC, BOARD, TASK, { kind: "project", uuid: "x" }, { kind: "task" }, { kind: "doc" }, "doc"] })).toEqual([DOC, BOARD, TASK])
    expect(filesOf({ files: null })).toEqual([])
    expect(filesOf(undefined)).toEqual([])
    expect(EVENT_FILE_KINDS).toEqual(["doc", "board", "task"])
  })

  it("adds one once, up to 25, and takes one off", () => {
    expect(withFile([DOC], TASK)).toEqual([DOC, TASK])
    expect(withFile([DOC, TASK], { ...TASK })).toEqual([DOC, TASK])
    const full = Array.from({ length: MAX_EVENT_FILES }, (_, i) => ({ kind: "doc" as const, uuid: `u${i}` }))
    expect(withFile(full, BOARD)).toEqual(full)
    expect(MAX_EVENT_FILES).toBe(25)
    expect(withoutFile([DOC, TASK], { ...TASK })).toEqual([DOC])
  })

  it("links one and unlinks one through the calendar's own API, each refusal in the app's error toast", () => {
    expect(addFileRequest("ev 1", TASK)).toEqual({
      method: "POST",
      apiEndpoint: "/calendar/events",
      appendToUrl: "/ev%201/files",
      payload: { kind: "task", uuid: TASK.uuid },
      showErrorToast: true,
      failureTitle: "Couldn't link it to the event",
    })
    expect(removeFileRequest("ev 1", BOARD)).toEqual({
      method: "DELETE",
      apiEndpoint: "/calendar/events",
      appendToUrl: `/ev%201/files/board/${BOARD.uuid}`,
      showErrorToast: true,
      failureTitle: "Couldn't unlink it from the event",
    })
  })
})
