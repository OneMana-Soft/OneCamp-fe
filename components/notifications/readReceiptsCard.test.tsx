import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Read receipts save the moment they are switched. A save that fails puts the
// switch back and says why, with the server's own words, where it used to say
// "Could not save that".

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

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't turn read receipts off",
        description: "The demo is shared, so this can't change here.",
        variant: "destructive",
      }),
    )
    // The last write to the cache is the answer as it was.
    expect(mutate).toHaveBeenLastCalledWith(answer, { revalidate: false })
  })

  it("leaves the failure to the card, not to a second global toast", async () => {
    post.mockResolvedValue({})
    render(<ReadReceiptsCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Send and see read receipts" })))
    expect(post.mock.calls[0][2]).toEqual({ suppressErrorToast: true })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Read receipts off" }))
  })
})
