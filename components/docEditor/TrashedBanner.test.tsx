import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const hoisted = vi.hoisted(() => ({
  page: undefined as unknown,
  error: undefined as unknown,
  restore: vi.fn(),
  purge: vi.fn(),
  confirm: vi.fn(),
  restored: vi.fn(),
  push: vi.fn(),
  toasts: [] as { title?: string }[],
}))

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: hoisted.page ? { data: hoisted.page } : undefined, isError: hoisted.error }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => hoisted.confirm }))
vi.mock("@/hooks/use-toast", () => ({ toast: (t: { title?: string }) => hoisted.toasts.push(t) }))
vi.mock("@/services/docGraphService", () => ({ restoreDoc: hoisted.restore, purgeDoc: hoisted.purge }))
vi.mock("@/lib/docCache", () => ({ docRestored: hoisted.restored }))

import { TrashedBanner } from "./TrashedBanner"
import { provideNavigate } from "./chrome/pageFacts"

const page = {
  doc_uuid: "t1",
  doc_title: "Old plan",
  doc_body: "<p>What we planned.</p>",
  doc_icon: "📘",
  deleted_at: "2026-10-12T12:00:00Z",
  deleted_by: { user_uuid: "u1", user_name: "Asha" },
  subpages: 2,
  can_restore: true,
  can_purge: true,
  purge_at: "2026-11-12T10:00:00Z",
}

beforeEach(() => {
  hoisted.page = page
  hoisted.error = undefined
  hoisted.restore.mockReset().mockResolvedValue({ restored: 3 })
  hoisted.purge.mockReset().mockResolvedValue(3)
  hoisted.confirm.mockReset()
  hoisted.toasts.length = 0
  provideNavigate(hoisted.push)
})
afterEach(cleanup)
// Today is pinned (app/testClock.test.ts): three days after the doc was deleted, a month before it goes for good, in the year of both (so neither day writes its year).
pinTestClock()

describe("a doc in the trash (E2)", () => {
  it("says who deleted it and when it goes for good, and shows it as it was", () => {
    render(<TrashedBanner docId="t1" canRestore onRestored={() => {}} />)
    expect(screen.getByText("This doc is in the trash")).toBeTruthy()
    expect(screen.getByRole("status").textContent).toContain("Asha deleted it · 3 days ago · It goes for good on 12 Nov · 2 pages went with it")
    expect(screen.getByRole("heading", { name: "Old plan" })).toBeTruthy()
    expect(screen.getByText("What we planned.")).toBeTruthy()
  })

  it("restores it with what went with it", async () => {
    const restored = vi.fn()
    render(<TrashedBanner docId="t1" canRestore onRestored={restored} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore" })))
    // The banner says a failure itself, so the app's toast stays quiet: one toast, not two.
    expect(hoisted.restore).toHaveBeenCalledWith("t1", { ownErrors: true })
    expect(hoisted.restored).toHaveBeenCalledWith("t1")
    expect(restored).toHaveBeenCalled()
  })

  it("deletes it for good only once confirmed, for whoever may", async () => {
    render(<TrashedBanner docId="t1" canRestore onRestored={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete for good" }))
    expect(hoisted.purge).not.toHaveBeenCalled()
    const asked = hoisted.confirm.mock.calls[0][0]
    expect(asked).toMatchObject({ title: "Delete this doc for good?", destructive: true })
    expect(asked.description).toContain("and the 2 pages deleted with it go for good")
    await act(async () => asked.onConfirm())
    expect(hoisted.purge).toHaveBeenCalledWith("t1", { ownErrors: true })
    expect(hoisted.push).toHaveBeenCalledWith("/app/doc")
  })

  it("offers a viewer neither, and says who can", () => {
    hoisted.page = { ...page, can_restore: false, can_purge: false }
    render(<TrashedBanner docId="t1" canRestore={false} onRestored={() => {}} />)
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Delete for good" })).toBeNull()
    expect(screen.getByText("Its owner, its editors or an admin can restore it.")).toBeTruthy()
  })

  it("falls back to saying it was deleted when its page can't be had", () => {
    hoisted.page = undefined
    hoisted.error = new Error("404")
    render(<TrashedBanner docId="t1" canRestore onRestored={() => {}} />)
    expect(screen.getByText("This doc was deleted")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy()
  })
})
