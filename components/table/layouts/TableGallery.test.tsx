import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// A cover's image comes as the attachment viewer's does: a URL the server signs for the reader.
const media = vi.hoisted(() => vi.fn((url: string) => ({ data: url ? { url: `https://files.test/${url.split("/").pop()}.png` } : undefined })))
vi.mock("@/hooks/useFetch", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useFetch")>()), useMediaFetch: (url: string) => media(url) }))

import { TableGallery } from "@/components/table/layouts/TableGallery"
import type { TableField, TableRow } from "@/services/tableService"

afterEach(() => {
  cleanup()
  media.mockClear()
})

const fields: TableField[] = [
  { id: "name", table_id: "t", name: "Name", type: "text", config: "{}", position: 0 },
  { id: "amount", table_id: "t", name: "Amount", type: "number", config: "{}", position: 1 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ id: "o1", label: "Won", color: "moss" }] }), position: 2 },
  { id: "pics", table_id: "t", name: "Pics", type: "attachment", config: "{}", position: 3 },
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 4 },
]
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })
const rows = [
  row("r1", { name: "Kettle", amount: 1200, stage: "Won", notes: "secret", pics: [{ id: "f1", name: "kettle.jpg", mime: "image/jpeg" }] }),
  row("r2", { name: "Toaster", amount: 40, pics: [{ id: "f2", name: "spec.pdf", mime: "application/pdf" }] }),
  row("r3", { name: "" }),
]
const cards = () => screen.getAllByRole("listitem").filter((li) => li.hasAttribute("data-card"))

describe("B4's gallery", () => {
  it("draws each row as a card: its title, the fields it shows by name, the hidden left off; a card opens its record", () => {
    const onOpen = vi.fn()
    render(<TableGallery tableId="t" fields={fields} hidden={["notes"]} rows={rows} edits={new Map()} onOpen={onOpen} />)
    expect(cards()).toHaveLength(3)
    const kettle = within(cards()[0])
    expect(kettle.getByText("Kettle")).toBeTruthy()
    expect(kettle.getByText("Amount")).toBeTruthy()
    expect(kettle.getByText("1,200")).toBeTruthy()
    expect(kettle.getByText("Won")).toBeTruthy()
    // Hidden by the view, and the cover's field is the cover, not a line.
    expect(kettle.queryByText("Notes")).toBeNull()
    expect(kettle.queryByText("secret")).toBeNull()
    expect(kettle.queryByText("Pics")).toBeNull()
    // A row with no title says so.
    expect(within(cards()[2]).getByText("Untitled")).toBeTruthy()
    expect(cards()[1].getAttribute("aria-posinset")).toBe("2")
    expect(cards()[1].getAttribute("aria-setsize")).toBe("3")
    fireEvent.click(within(cards()[1]).getByRole("button"))
    expect(onOpen).toHaveBeenCalledWith("r2")
  })

  it("covers a card with its first image in the attachments field, fetched as the viewer fetches it, and no image with the file's glyph", () => {
    render(<TableGallery tableId="t" fields={fields} rows={rows} edits={new Map()} onOpen={() => {}} />)
    const img = cards()[0].querySelector("img")
    expect(img?.getAttribute("src")).toBe("https://files.test/f1.png")
    expect(media).toHaveBeenCalledWith(expect.stringMatching(/\/t\/files\/f1$/))
    // A PDF is no cover: nothing is fetched for it.
    expect(cards()[1].querySelector("img")).toBeNull()
    expect(cards()[1].querySelector('[data-cover="none"]')).not.toBeNull()
    expect(media).not.toHaveBeenCalledWith(expect.stringMatching(/f2$/))
  })

  it("colours a card as the view colours its row, with a band", () => {
    render(<TableGallery tableId="t" fields={fields} rows={rows} hues={new Map([["r2", "berry"]])} edits={new Map()} onOpen={() => {}} />)
    expect(cards()[1].querySelector("[data-row-hue]")?.getAttribute("data-row-hue")).toBe("berry")
    expect(cards()[0].querySelector("[data-row-hue]")).toBeNull()
  })

  it("holds the places not read yet as quiet cards, and reads on near the end", () => {
    const onNearEnd = vi.fn()
    render(<TableGallery tableId="t" fields={fields} rows={rows.slice(0, 2)} count={1200} edits={new Map()} onOpen={() => {}} onNearEnd={onNearEnd} />)
    expect(cards()).toHaveLength(2)
    expect(document.querySelectorAll("li[data-placeholder]").length).toBeGreaterThan(0)
    expect(onNearEnd).toHaveBeenCalled()
    expect(cards()[0].getAttribute("aria-setsize")).toBe("1200")
  })

  it("says why there are no cards", () => {
    render(<TableGallery tableId="t" fields={fields} rows={[]} edits={new Map()} onOpen={() => {}} empty={<p>No rows yet</p>} />)
    expect(screen.getByText("No rows yet")).toBeTruthy()
  })
})
