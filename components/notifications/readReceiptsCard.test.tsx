import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Read receipts save the moment they are switched, with the row's saved tick
// (design v3, admin §1.3: never a toast for a routine save). A save that fails
// puts the switch back and says why, in the server's own words, on the row.

const { state, post, toast } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, unknown> },
  post: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.fetch }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import { ReadReceiptsCard } from "./ReadReceiptsCard"

const mutate = vi.fn(async () => undefined)
const answer = { data: { read_receipts: true, read_receipts_allowed: true } }

beforeEach(() => {
  state.fetch = { data: answer, isLoading: false, isError: undefined, mutate }
  post.mockReset()
  toast.mockReset()
  mutate.mockClear()
})
afterEach(cleanup)

describe("switching read receipts", () => {
  it("says the server's reason and puts the switch back when the save fails", async () => {
    post.mockRejectedValue({ response: { status: 403, data: { msg: "The demo is shared, so this can't change here." } } })
    render(<ReadReceiptsCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Send and see read receipts" })))

    expect(screen.getByText("The demo is shared, so this can't change here.")).toBeInTheDocument()
    expect(toast).not.toHaveBeenCalled()
    // The last write to the cache is the answer as it was.
    expect(mutate).toHaveBeenLastCalledWith(answer, { revalidate: false })
  })

  it("asks quietly for the global toast, and ticks the row when it holds", async () => {
    post.mockResolvedValue({})
    render(<ReadReceiptsCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Send and see read receipts" })))
    expect(post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
    expect(document.querySelector("[data-saved-tick]")).not.toBeNull()
    expect(document.getElementById("notifications-read-receipts")).not.toBeNull()
  })
})
