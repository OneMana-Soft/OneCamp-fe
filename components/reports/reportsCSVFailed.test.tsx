import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { Report } from "@/lib/reports"
import { pinTestClock } from "@/lib/testing/testClock"

// B9-b4 (CR-B14 W15): Reports' CSV writer is a chunk of its own (lib/reportCSV),
// fetched as it is asked for. Offline, it can't load: Reports says so, and
// saves nothing. Its own file, because the chunk fails for every test in it.

pinTestClock()

const report = {
  weeks: ["2026-10-05"],
  done: [1],
  added: [1],
  open: 1,
  overdue: 0,
  due_this_week: 0,
  done_total: 1,
  on_time_percent: 100,
  projects: [],
  people: [],
  priorities: [],
  all_projects: [{ project_uuid: "q4", project_name: "Q4 launch" }],
  truncated: false,
} as unknown as Report

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: { data: report }, mutate: vi.fn() }), useFetchOnlyOnce: () => ({ mutate: vi.fn() }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Asia/Kolkata" }))
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(), useRouter: () => ({ replace: vi.fn() }) }))
const download = vi.fn(() => true)
vi.mock("@/lib/utils/file/downloadTextFile", () => ({ downloadTextFile: (...a: unknown[]) => download(...(a as [])) }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/lib/reportCSV", () => {
  throw new Error("Failed to fetch dynamically imported module")
})

const { ReportsView } = await import("@/components/reports/ReportsView")

afterEach(cleanup)

describe("Reports' CSV, offline", () => {
  it("says the CSV couldn't load, and saves nothing", async () => {
    render(<ReportsView />)
    fireEvent.click(screen.getByRole("button", { name: /Download CSV/ }))
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", title: "The CSV couldn't load" })))
    expect(download).not.toHaveBeenCalled()
  })
})
