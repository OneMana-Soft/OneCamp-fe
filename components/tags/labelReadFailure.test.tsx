import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"

// Who says that a project's labels or forms couldn't be read (review of web
// Q5). The label picker and the forms dialog draw the failure in place, with
// Try again, so their reads are told nowhere else. The board's tag filter and
// the bulk bar draw nothing for a failed read of the same labels, so theirs
// still raises the toast: OWN_ERRORS in the shared read left them silent.

const told = vi.hoisted(() => vi.fn())
vi.mock("@/lib/http/loadFailure", async (orig) => ({ ...(await orig<typeof import("@/lib/http/loadFailure")>()), tellReadFailure: told }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: { get: (url: string) => Promise.reject({ config: { method: "get", url }, response: { status: 500, data: { msg: "Resting." } } }) },
}))
// The forms dialog asks before a delete (useConfirm), which takes the store's dispatch.
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))

const { TagPicker } = await import("@/components/tags/TagPicker")
const { TagFilter } = await import("@/components/tags/TagFilter")
const { ProjectFormsDialog } = await import("@/components/project/ProjectFormsDialog")
const { projectFormsKey } = await import("@/hooks/useProjectForms")

// The addresses of the failed reads that were told.
const toldReads = () => told.mock.calls.map(([error]) => (error as { config: { url: string } }).config.url)

// A cache of its own per render, and no retries: one read, one failure.
const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)

afterEach(() => {
  cleanup()
  told.mockClear()
})

describe("a read of a project's labels that failed", () => {
  it("is said in the label picker, with Try again, and nowhere else", async () => {
    render(<TagPicker projectId="p" label="" canEdit onChange={() => {}} />, { wrapper: fresh })
    fireEvent.click(screen.getByRole("button", { name: "Add labels" }))
    expect(await screen.findByRole("button", { name: "Try again" })).toBeTruthy()
    expect(told).not.toHaveBeenCalled()
  })

  it("is still told for the board's tag filter, which draws nothing for it", async () => {
    render(<TagFilter projectId="p" active={[]} onChange={() => {}} />, { wrapper: fresh })
    await waitFor(() => expect(told).toHaveBeenCalledTimes(1))
  })
})

describe("a read of a project's forms that failed", () => {
  it("is said in the dialog, with Try again, and nowhere else", async () => {
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />, { wrapper: fresh })
    expect(await screen.findByText("Couldn't load this project's forms")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    // The dialog's read of the project's fields draws nothing of its own, so
    // its failure is told; the error state on screen keeps that toast quiet.
    expect(toldReads()).not.toContain(projectFormsKey("p"))
  })
})
