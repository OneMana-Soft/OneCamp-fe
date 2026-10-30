import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// "Record my views" (docs C6-3): off, a person is left out of every doc's
// "Viewed by" and its daily count. It saves at once, like read receipts: a
// held save is offered back, and a failed one puts the switch back.

const { state, post, toast } = vi.hoisted(() => ({
  state: { fetch: {} as Record<string, unknown> },
  post: vi.fn(),
  toast: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => state.fetch }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post } }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import { DocViewsCard } from "./DocViewsCard"

const mutate = vi.fn(async () => undefined)
const answer = { data: { read_receipts: true, record_views: true } }

beforeEach(() => {
  state.fetch = { data: answer, isLoading: false, isError: undefined, mutate }
  post.mockReset()
  toast.mockReset()
  mutate.mockClear()
})
afterEach(cleanup)

describe("record my views", () => {
  it("saves only its own key when switched off", async () => {
    post.mockResolvedValue({})
    render(<DocViewsCard />)
    const row = screen.getByRole("switch", { name: "Record my views" })
    expect(row).toHaveAttribute("aria-checked", "true")
    await act(async () => void fireEvent.click(row))
    expect(post.mock.calls[0][1]).toEqual({ record_views: false })
    expect(document.getElementById("notifications-doc-views")).not.toBeNull()
  })

  it("offers the change back under its label, and Undo saves it the other way", async () => {
    post.mockResolvedValue({})
    render(<DocViewsCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Record my views" })))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Record my views: Off" })))

    const [{ action }] = toast.mock.calls[0] as [{ action: { props: { onClick: () => Promise<void> } } }]
    await act(() => action.props.onClick())
    expect(post.mock.calls.map((c) => c[1])).toEqual([{ record_views: false }, { record_views: true }])
  })

  it("puts the switch back when the save fails", async () => {
    post.mockRejectedValue({ response: { status: 403, data: { msg: "Not here." } } })
    render(<DocViewsCard />)
    await act(async () => void fireEvent.click(screen.getByRole("switch", { name: "Record my views" })))
    expect(mutate).toHaveBeenLastCalledWith(answer, { revalidate: false })
  })

  it("shows nothing until the answer names the choice", () => {
    state.fetch = { data: { data: { read_receipts: true } }, mutate }
    const { container } = render(<DocViewsCard />)
    expect(container).toBeEmptyDOMElement()
  })
})
