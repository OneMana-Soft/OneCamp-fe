import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"

const getJob = vi.hoisted(() => vi.fn())
vi.mock("@/lib/export/contentIO", async (real) => ({ ...(await real<typeof import("@/lib/export/contentIO")>()), getJob }))

import { useImportJobs } from "./useImportJobs"
import type { ContentIOJob } from "@/lib/export/contentIO"

const file = (name: string) => new File(["x"], name, { lastModified: 1 })
const running = (id: string) => ({ id, status: "running" }) as ContentIOJob

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  getJob.mockReset()
})

// AUDIT-WEB-2 W3: the import hook every import dialog shares.
describe("following an import's files", () => {
  it("starts each file once, however often Import is pressed while one uploads", async () => {
    let upload: (job: ContentIOJob) => void = () => {}
    const start = vi.fn(() => new Promise<ContentIOJob>((done) => (upload = done)))
    const { result } = renderHook(() => useImportJobs({ check: () => undefined, start }))
    act(() => result.current.add([file("plan.ics")]))
    let first: Promise<void> = Promise.resolve()
    act(() => {
      first = result.current.run()
    })
    expect(result.current.busy).toBe(true)
    await act(() => result.current.run())
    expect(start).toHaveBeenCalledTimes(1)
    await act(async () => {
      upload(running("job-1"))
      await first
    })
    expect(result.current.rows[0].job?.id).toBe("job-1")
  })

  it("ends a job the server no longer answers for, and stops asking after it", async () => {
    const start = vi.fn(async () => running("job-gone"))
    const { result } = renderHook(() => useImportJobs({ check: () => undefined, start }))
    act(() => result.current.add([file("plan.ics")]))
    await act(() => result.current.run())
    getJob.mockRejectedValue({ response: { status: 404, data: {} } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(result.current.rows[0].error).toMatch(/can't be followed/)
    expect(result.current.busy).toBe(false)
    const asked = getJob.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(getJob.mock.calls.length).toBe(asked)
  })

  it("follows no more a job that's ready for the person's choices", async () => {
    const start = vi.fn(async () => running("job-ready"))
    const { result } = renderHook(() => useImportJobs({ check: () => undefined, start }))
    act(() => result.current.add([file("deals.csv")]))
    await act(() => result.current.run())
    getJob.mockResolvedValue({ id: "job-ready", status: "ready" } as ContentIOJob)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(result.current.rows[0].job?.status).toBe("ready")
    const asked = getJob.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    expect(getJob.mock.calls.length).toBe(asked)
  })
})
