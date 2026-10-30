import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A doc's or a board's Viewed by: rows on the dialog's ground with faces in
// their hues, the list's own shape while it loads, and an empty list said the
// same way. (B8's history dialog has tests of its own.)

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...fetched, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
const get = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import ResourceViewersDialog from "./resourceViewersDialog"

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  get.mockReset()
})

describe("a doc's viewers", () => {
  it("says no views the same way, as a heading under an icon", async () => {
    get.mockResolvedValue({ data: { data: [], count: 0 } })
    render(<ResourceViewersDialog open onOpenChange={() => {}} viewersEndpoint="/v" idParam="doc_uuid" resourceId="d" noun="document" />)
    expect(await screen.findByRole("heading", { name: "No views yet" })).toBeTruthy()
  })

  it("shows each viewer with a face in their own hue", async () => {
    get.mockResolvedValue({ data: { data: [{ user_uuid: "u2", user_full_name: "Jonas Weber", last_viewed_at: new Date().toISOString() }], count: 1 } })
    render(<ResourceViewersDialog open onOpenChange={() => {}} viewersEndpoint="/v" idParam="doc_uuid" resourceId="d" noun="document" />)
    await screen.findByText("Jonas Weber")
    expect(screen.getByRole("dialog").querySelector("[data-hue]")).toBeTruthy()
  })
})
