import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// "New doc", one click as ever, with "▾" beside it for the rest of what Docs
// & Files holds (docs F1b, DOCS-LEAD-2's ruling b): Page, Folder, Upload
// files, Link. On a phone the "▾" opens a sheet.

const sheet = vi.hoisted(() => ({ on: false }))
vi.mock("@/components/ui/overlayMode", () => ({ useSheetMode: () => sheet.on, SHEET_QUERY: "" }))

import { NewSplitButton } from "./NewMenu"

const on = { page: vi.fn(), folder: vi.fn(), upload: vi.fn(), link: vi.fn() }
const show = (running: string | null = null) =>
  render(<NewSplitButton onPage={on.page} onFolder={on.folder} onUpload={on.upload} onLink={on.link} running={running} own="space:s1" />)

beforeEach(() => {
  sheet.on = false
  for (const f of Object.values(on)) f.mockClear()
})
afterEach(cleanup)

describe("New doc ▾", () => {
  it("makes a page in one click", () => {
    show()
    fireEvent.click(screen.getByRole("button", { name: "New doc" }))
    expect(on.page).toHaveBeenCalledTimes(1)
  })

  // Beta's rule 12: busy with its own action (it spins in its own colours),
  // waiting, disabled, while another runs; ▾ only opens a menu, so it waits.
  it("is busy while its own page is made, and waits, ▾ too, while another is", () => {
    show("space:s1")
    const primary = screen.getByRole("button", { name: "New doc" }) as HTMLButtonElement
    expect(primary.getAttribute("aria-busy")).toBe("true")
    expect(primary.disabled).toBe(false)
    expect((screen.getByRole("button", { name: "More to add" }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    show("folder:f2")
    const waiting = screen.getByRole("button", { name: "New doc" }) as HTMLButtonElement
    expect(waiting.getAttribute("aria-busy")).toBeNull()
    expect(waiting.disabled).toBe(true)
  })

  it("offers Page, Folder, Upload files and Link from ▾", async () => {
    show()
    await act(async () => fireEvent.keyDown(screen.getByRole("button", { name: "More to add" }), { key: "Enter" }))
    const items = await screen.findAllByRole("menuitem")
    expect(items.map((i) => i.textContent?.trim())).toEqual(["Page", "Folder", "Upload files", "Link"])
    fireEvent.click(screen.getByRole("menuitem", { name: "Upload files" }))
    expect(on.upload).toHaveBeenCalled()
  })

  it("is a sheet on a phone", () => {
    sheet.on = true
    show()
    fireEvent.click(screen.getByRole("button", { name: "More to add" }))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getAllByRole("button").map((b) => b.textContent?.trim())).toEqual(["Page", "Folder", "Upload files", "Link"])
    fireEvent.click(within(dialog).getByRole("button", { name: "Folder" }))
    expect(on.folder).toHaveBeenCalled()
  })
})
