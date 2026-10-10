import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { AxiosError, type InternalAxiosRequestConfig } from "axios"

// A plan refused because the import's last run is still stopping (409
// run_alive, its reason in `error`) is said once. The request goes through
// the real axios instance, global error toast and all, and the real Slack
// import service; only the server's answer is stood in for. Before, the
// global toast said "Already changed" and the dialog then said "Planning
// failed" over it, and left nothing to try again.
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...args: unknown[]) => toast(...args), useToast: () => ({ toast }) }))

const { default: axiosInstance } = await import("@/lib/axiosInstance")
const { SlackImportPlanDialog } = await import("./SlackImportPlanDialog")

const RUN_ALIVE = { code: "run_alive", error: "The last run of this import is still stopping. Try again in a moment." }

afterEach(() => {
  cleanup()
  toast.mockClear()
})

describe("an import whose last run is still stopping", () => {
  it("is said once, in the Slack plan dialog, with a way to try again", async () => {
    axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response = { data: RUN_ALIVE, status: 409, statusText: "Conflict", headers: {}, config }
      throw new AxiosError("Request failed with status code 409", "ERR_BAD_REQUEST", config, {}, response as never)
    }
    render(<SlackImportPlanDialog jobId="j1" open onOpenChange={() => {}} onComplete={() => {}} />)
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(RUN_ALIVE.error))
    expect(screen.getAllByText(/still stopping/)).toHaveLength(1)
    // No toast at all: neither the global "Already changed" nor "Planning failed".
    expect(toast).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
  })
})
