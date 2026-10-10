import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A doc's or a board's Viewed by and Version history read as one family: rows
// on the dialog's ground with faces in their hues, the list's own shape while
// it loads, and an empty list said the same way.

let fetched: { data?: unknown; isLoading: boolean } = { isLoading: false }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ ...fetched, mutate: vi.fn() }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(), isSubmitting: false }) }))
const get = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { get: (...a: unknown[]) => get(...a) } }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))

import { DocVersionHistoryDialog } from "./docVersionHistoryDialog"
import ResourceViewersDialog from "./resourceViewersDialog"

afterEach(() => {
  cleanup()
  fetched = { isLoading: false }
  get.mockReset()
})

describe("a doc's version history", () => {
  it("lists versions as rows, why each was kept as dot and word, and faces in their hues", () => {
    fetched = {
      isLoading: false,
      data: { data: [{ id: "s1", body_bytes: 10, reason: "manual", created_at: new Date().toISOString(), contributors: [{ user_uuid: "u1", user_full_name: "Maya Chen" }] }] },
    }
    render(<DocVersionHistoryDialog open onOpenChange={() => {}} docId="d" />)
    const dialog = screen.getByRole("dialog")
    expect(dialog.querySelector(".border.bg-card\\/50")).toBeNull()
    const reason = screen.getByText("Before a restore")
    expect(reason.className).not.toMatch(/text-primary|rounded-full/)
    expect(dialog.querySelector("[data-hue]")).toBeTruthy()
  })

  it("loads as its rows and says an empty history as the viewers list says an empty one", () => {
    fetched = { isLoading: true }
    render(<DocVersionHistoryDialog open onOpenChange={() => {}} docId="d" />)
    expect(screen.getByRole("status", { name: "Loading versions" })).toBeTruthy()
    expect(document.querySelector(".animate-spin")).toBeNull()
    cleanup()
    fetched = { isLoading: false, data: { data: [] } }
    render(<DocVersionHistoryDialog open onOpenChange={() => {}} docId="d" />)
    expect(screen.getByRole("heading", { name: "No versions yet" })).toBeTruthy()
  })
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
