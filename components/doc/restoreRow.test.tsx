import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// A doc in the trash or the archive, as a row with a way back (docs programme
// B5). Restore is every row's last button, so the Restores line up down the
// trash whether or not a row may also be deleted for good; on a phone the
// line under the title wraps rather than cut off when it goes for good.

const restoreDoc = vi.fn(async (id: string) => {
  void id
  return 3
})
vi.mock("@/services/docGraphService", () => ({ restoreDoc: (id: string) => restoreDoc(id), purgeDoc: vi.fn() }))
vi.mock("@/lib/docCache", () => ({ docRestored: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (t: unknown) => toast(t) }))

import { RestoreRow } from "./RestoreRow"

afterEach(cleanup)

const row = (canPurge: boolean) => (
  <RestoreRow id="old-plan" title="Old plan" verb="Deleted" at="2026-10-12T10:00:00Z" subpages={2} purgeAt="2026-11-11T10:00:00Z" canPurge={canPurge} />
)

describe("a row in the trash", () => {
  it("ends with Restore, with or without Delete for good before it", () => {
    const { container, rerender } = render(row(true))
    const labels = () => Array.from(container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label") ?? b.textContent?.trim())
    expect(labels()).toEqual(["Delete “Old plan” for good", "Restore"])
    rerender(row(false))
    expect(labels()).toEqual(["Restore"])
  })

  it("wraps its line on a phone instead of cutting off when it goes for good", () => {
    render(row(false))
    const line = screen.getByText(/goes for good on/).closest("p")!
    expect(line.className).toMatch(/max-sm:line-clamp-2/)
    expect(line.className).toMatch(/sm:truncate/)
  })

  it("brings it back with the pages deleted with it, and says so", async () => {
    render(row(false))
    fireEvent.click(screen.getByRole("button", { name: "Restore" }))
    await waitFor(() => expect(restoreDoc).toHaveBeenCalledWith("old-plan"))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Restored “Old plan” and 2 pages inside" })))
  })
})
