import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { DocListItem, TreeNodeJSON } from "@/types/docGraph"

vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn() } }))

import { ColourDot, NodeMark, markOfListItem, markOfRow, nodeHue } from "./NodeMark"
import { CAMP_SWATCHES } from "@/components/ui/campSwatches"
import { HueSwatches } from "@/components/ui/hueSwatches"

// Each kind's mark (docs F1b): a folder on its colour's tile, ink when it has
// none; a file by its type (fileTypeIcon's glyph and hue); a link by its
// provider; a page by its own icon. A row tints in its colour first, then its
// kind's own hue. The swatches are the six camp hues and None (D-31).

afterEach(cleanup)

const mark = () => document.querySelector<HTMLElement>("[data-node-mark]")!

describe("a node's mark", () => {
  it("draws a folder on its colour's tile, and in ink when it has none", () => {
    render(<NodeMark node={{ id: "f", kind: "folder", color: "moss" }} />)
    expect(mark().dataset.nodeMark).toBe("folder")
    expect(mark().className).toMatch(/hue-moss/)
    expect(mark().className).toMatch(/bg-hue-tint/)
    cleanup()
    render(<NodeMark node={{ id: "f", kind: "folder" }} />)
    expect(mark().className).not.toMatch(/hue-/)
    expect(mark().className).toMatch(/text-ink-2/)
  })

  it("draws a file by its type, from its name and its media type", () => {
    render(<NodeMark node={{ id: "a", kind: "file", file: { name: "brief.pdf", mime: "application/pdf" } }} />)
    expect(mark().dataset.nodeMark).toBe("file")
    expect(mark().querySelector("[data-file-kind]")?.getAttribute("data-file-kind")).toBe("pdf")
    cleanup()
    render(<NodeMark node={{ id: "b", kind: "file", file: { name: "Q4 plan", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" } }} />)
    expect(mark().querySelector("[data-file-kind]")?.getAttribute("data-file-kind")).toBe("slides")
  })

  it("draws a link by its provider", () => {
    render(<NodeMark node={{ id: "l", kind: "link", linkUrl: "https://docs.google.com/spreadsheets/d/1/edit" }} />)
    expect(mark().dataset.nodeMark).toBe("link")
    expect(mark().dataset.provider).toBe("google-sheets")
    expect(mark().className).toMatch(/hue-moss/)
  })

  it("draws a page by its own icon", () => {
    render(<NodeMark node={{ id: "page-0001", icon: "🚀" }} />)
    expect(mark().dataset.nodeMark).toBe("page")
    expect(mark().textContent).toContain("🚀")
  })
})

describe("a row's hue", () => {
  it("is its colour first, then what its kind wears", () => {
    expect(nodeHue({ id: "f", kind: "folder", color: "berry" })).toBe("berry")
    expect(nodeHue({ id: "f", kind: "folder" })).toBeNull()
    expect(nodeHue({ id: "a", kind: "file", file: { name: "sheet.xlsx" } })).toBe("moss")
    expect(nodeHue({ id: "a", kind: "file", color: "sun", file: { name: "sheet.xlsx" } })).toBe("sun")
    expect(nodeHue({ id: "l", kind: "link", linkUrl: "https://example.org" })).toBeNull()
  })

  it("reads a tree row and a list row alike", () => {
    const row: TreeNodeJSON = { kind: "doc", uuid: "f1", title: "Specs", has_children: false, node_kind: "file", color: "lake", file: { name: "a.pdf", size_bytes: 1, mime: "application/pdf", versions: 1, attachment_id: "x" } }
    expect(markOfRow(row)).toEqual({ id: "f1", kind: "file", color: "lake", icon: undefined, linkUrl: undefined, file: { name: "a.pdf", mime: "application/pdf" } })
    const item: DocListItem = { doc_uuid: "l1", doc_title: "Roadmap", path: [], doc_node_kind: "link", doc_link_url: "https://figma.com/file/1" }
    expect(markOfListItem(item)).toEqual({ id: "l1", kind: "link", color: undefined, icon: undefined, linkUrl: "https://figma.com/file/1", file: undefined })
  })

  it("shows a colour as a dot after a page's, a file's or a link's title", () => {
    render(<ColourDot hue="dusk" />)
    const dot = document.querySelector<HTMLElement>("[data-colour-dot]")!
    expect(dot.dataset.colourDot).toBe("dusk")
    expect(dot.className).toMatch(/hue-dusk/)
  })
})

describe("the swatches", () => {
  it("are None and the six camp hues, each named", () => {
    expect(CAMP_SWATCHES.map((s) => s.name)).toEqual(["Moss", "Sun", "Lake", "Sky", "Dusk", "Berry"])
    const pick = vi.fn()
    render(<HueSwatches value={null} onPick={pick} />)
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["No colour", "Moss", "Sun", "Lake", "Sky", "Dusk", "Berry"])
    expect(radios[0]).toHaveAttribute("aria-checked", "true")
    expect(radios[0]).toHaveAttribute("tabindex", "0")
    expect(radios[1]).toHaveAttribute("tabindex", "-1")
  })

  it("moves with the arrows and picks with Enter, Space or a click; the chosen one wears a check", () => {
    const pick = vi.fn()
    render(<HueSwatches value="lake" onPick={pick} />)
    const lake = screen.getByRole("radio", { name: "Lake" })
    expect(lake).toHaveAttribute("aria-checked", "true")
    expect(lake.querySelector("svg")).not.toBeNull()
    lake.focus()
    fireEvent.keyDown(lake, { key: "ArrowRight" })
    expect(screen.getByRole("radio", { name: "Sky" })).toHaveFocus()
    expect(pick).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole("radio", { name: "Sky" }), { key: "Enter" })
    expect(pick).toHaveBeenLastCalledWith("sky")
    fireEvent.click(screen.getByRole("radio", { name: "No colour" }))
    expect(pick).toHaveBeenLastCalledWith(null)
  })
})
