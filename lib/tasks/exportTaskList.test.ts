import { beforeEach, describe, expect, it, vi } from "vitest"

const downloadFrom = vi.fn()
const toast = vi.fn()
vi.mock("@/lib/utils/download", () => ({ downloadFrom: (...a: unknown[]) => downloadFrom(...a) }))
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a) }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))

import { exportTaskList } from "./exportTaskList"
import { GetEndpointUrl } from "@/services/endPoints"

const answer = (total: number, rows: number) => ({ data: new Blob(), headers: { "x-total-count": String(total), "x-export-rows": String(rows) } })

beforeEach(() => {
  downloadFrom.mockReset()
  toast.mockReset()
})

describe("a project's task list as a CSV file", () => {
  it("asks for the list as it reads, sorted, filtered and searched, on this browser's calendar, without a page", async () => {
    downloadFrom.mockResolvedValueOnce(answer(3, 3))
    await exportTaskList("p1", { sort: [{ id: "task_due_date", desc: true }], filters: [{ id: "task_status", value: ["todo"] }], search: "launch", pageSize: 50 })
    const [url, fallback] = downloadFrom.mock.calls[0] as [string, string]
    const [path, query] = url.split("?")
    expect(path).toBe(`${GetEndpointUrl.GetProjectTaskList}/p1`)
    expect(Object.fromEntries(new URLSearchParams(query))).toEqual({
      sorting: `[{"id":"task_due_date","desc":true}]`,
      filters: `[{"id":"task_status","value":["todo"]}]`,
      taskSearchString: "launch",
      format: "csv",
      tz: "Asia/Kolkata",
    })
    expect(fallback).toBe("tasks.csv")
    expect(toast).not.toHaveBeenCalled()
  })

  it("says when the file holds only the list's first part, and how to export the rest", async () => {
    downloadFrom.mockResolvedValueOnce(answer(50_001, 50_000))
    await exportTaskList("p1", {})
    expect(toast).toHaveBeenCalledWith({ title: "Exported the first 50,000 of 50,001 tasks", description: "Filter the list to export the rest." })
  })

  it("says nothing more for a server that doesn't count", async () => {
    downloadFrom.mockResolvedValueOnce({ data: new Blob(), headers: {} })
    await exportTaskList("p1", {})
    expect(toast).not.toHaveBeenCalled()
  })

  it("says a failure itself, once", async () => {
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed"), { response: { status: 500, data: new Blob() } }))
    await exportTaskList("p1", {})
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't export the list", variant: "destructive" })
  })

  // Asked for as a file, a refusal comes back as one too: its words are read
  // back from the file (lib/utils/downloadRefusal) before the toast says them.
  // jsdom's Blob has no text(), so the answer here is one by its shape.
  it("says a refusal in the server's own words, read back from the file it came as", async () => {
    const why = "Project not found"
    const file = { type: "application/json", text: async () => JSON.stringify({ msg: why }) }
    downloadFrom.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 404"), { response: { status: 404, data: file } }))
    await exportTaskList("p1", {})
    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't export the list", description: why, variant: "destructive" })
  })
})
