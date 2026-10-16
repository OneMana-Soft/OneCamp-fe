import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import type { MarketplaceTemplate } from "@/services/marketplaceService"

// Choosing a doc template (docs programme B5): OneCamp's and the team's, found
// by name or kind, used in one press. Making a doc from one asks the server to
// write its body as it makes the doc; using one in an empty doc asks it to
// write into the live copy, which refuses a doc that holds anything (N37).

const tpl = (id: string, name: string, payload: object, extra: Partial<MarketplaceTemplate> = {}): MarketplaceTemplate => ({
  id,
  kind: "doc",
  name,
  description: `${name}, described.`,
  payload: JSON.stringify(payload),
  created_by: "00000000-0000-0000-0000-000000000000",
  created_at: "2026-10-13T00:00:00Z",
  updated_at: "2026-10-13T00:00:00Z",
  ...extra,
})
const LIST: MarketplaceTemplate[] = [
  tpl("b5d0c000-0000-4000-8000-000000000001", "Meeting notes", { title: "Meeting notes", builtin: true, hue: "sky", glyph: "list-todo", category: "Meetings", preview: "<h2>Agenda</h2>" }, { author_name: "OneCamp" }),
  tpl("b5d0c000-0000-4000-8000-000000000005", "RFC", { title: "RFC", builtin: true, hue: "lake", glyph: "lightbulb", category: "Engineering" }, { author_name: "OneCamp" }),
  tpl("team-0001", "Customer call notes", { title: "Customer call notes", builtin: false, hue: "sky", glyph: "users", category: "Workspace" }, { author_name: "Maya Chen" }),
  { ...tpl("agent-1", "Release captain", {}), kind: "agent" },
]

let answer: { data?: { data: MarketplaceTemplate[] }; isError?: boolean } = { data: { data: LIST } }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ ...answer, mutate: vi.fn() }) }))
const createDoc = vi.fn()
vi.mock("@/services/docGraphService", async (importOriginal) => ({ ...(await importOriginal<object>()), createDoc: (r: unknown) => createDoc(r) }))
const applyTemplate = vi.fn()
vi.mock("@/services/docHomeService", async (importOriginal) => ({ ...(await importOriginal<object>()), applyTemplate: (d: string, t: string) => applyTemplate(d, t) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", async (importOriginal) => ({ ...(await importOriginal<object>()), useDispatch: () => vi.fn() }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

import TemplatePicker, { categoriesOf, filterTemplates, pickerTemplates } from "./TemplatePicker"

afterEach(() => {
  cleanup()
  answer = { data: { data: LIST } }
  createDoc.mockReset()
  applyTemplate.mockReset()
})

describe("the picker's templates", () => {
  it("are the gallery's doc templates, OneCamp's by kind and the team's as theirs, with who made them", () => {
    const ts = pickerTemplates(LIST)
    expect(ts.map((t) => t.name)).toEqual(["Meeting notes", "RFC", "Customer call notes"])
    expect(ts.map((t) => t.category)).toEqual(["Meetings", "Engineering", "Your team's"])
    expect(ts[2].author).toBe("Maya Chen")
    expect(ts[0].author).toBeUndefined()
    expect(categoriesOf(ts)).toEqual(["Meetings", "Engineering", "Your team's"])
  })

  it("are OneCamp's own while the gallery hasn't answered", () => {
    const ts = pickerTemplates(undefined)
    expect(ts).toHaveLength(10)
    expect(ts.every((t) => t.builtin && !t.preview)).toBe(true)
  })

  it("are found by name, by what they say, and by kind", () => {
    const ts = pickerTemplates(LIST)
    expect(filterTemplates(ts, "customer", null).map((t) => t.name)).toEqual(["Customer call notes"])
    expect(filterTemplates(ts, "", "Engineering").map((t) => t.name)).toEqual(["RFC"])
    expect(filterTemplates(ts, "  ", null)).toHaveLength(3)
  })
})

describe("the picker", () => {
  it("makes a doc from the one chosen, for the server to write its body, where it was asked for", async () => {
    createDoc.mockResolvedValue({ doc_uuid: "d1", doc_title: "RFC" })
    const onClose = vi.fn()
    render(<TemplatePicker mode={{ kind: "create", space: "project:p-1" }} onClose={onClose} />)
    fireEvent.click(screen.getByRole("option", { name: /RFC/ }))
    await waitFor(() => expect(createDoc).toHaveBeenCalledOnce())
    expect(createDoc.mock.calls[0][0]).toMatchObject({ template_id: "b5d0c000-0000-4000-8000-000000000005", doc_title: "RFC", space: "project:p-1" })
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("puts the one chosen into an empty doc, and says the server's no in place when the doc isn't empty", async () => {
    applyTemplate.mockRejectedValueOnce({ response: { status: 409, data: { code: "not_empty", msg: "The doc has something in it already, so the template wasn't added." } } })
    const onClose = vi.fn()
    render(<TemplatePicker mode={{ kind: "apply", docId: "doc-9" }} onClose={onClose} />)
    fireEvent.click(screen.getByRole("option", { name: /Meeting notes/ }))
    await waitFor(() => expect(applyTemplate).toHaveBeenCalledWith("doc-9", "b5d0c000-0000-4000-8000-000000000001"))
    expect(await screen.findByRole("alert")).toHaveTextContent("The doc has something in it already, so the template wasn't added.")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("is chosen from the keyboard: ↓ moves, Enter uses it", async () => {
    applyTemplate.mockResolvedValue({ persisted: true })
    render(<TemplatePicker mode={{ kind: "apply", docId: "doc-9" }} onClose={vi.fn()} />)
    const find = screen.getByRole("combobox", { name: "Find a template" })
    expect(screen.getByRole("option", { name: /Meeting notes/ })).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(find, { key: "ArrowDown" })
    expect(screen.getByRole("option", { name: /RFC/ })).toHaveAttribute("aria-selected", "true")
    fireEvent.keyDown(find, { key: "Enter" })
    await waitFor(() => expect(applyTemplate).toHaveBeenCalledWith("doc-9", "b5d0c000-0000-4000-8000-000000000005"))
  })

  it("shows how the chosen one starts, from the server's preview", () => {
    render(<TemplatePicker mode={{ kind: "create" }} onClose={vi.fn()} />)
    const preview = document.querySelector('[data-template-preview="b5d0c000-0000-4000-8000-000000000001"]')
    expect(preview?.textContent).toContain("Agenda")
  })

  it("says when the team's templates couldn't be loaded, and still offers OneCamp's", () => {
    answer = { isError: true }
    render(<TemplatePicker mode={{ kind: "create" }} onClose={vi.fn()} />)
    expect(screen.getByRole("alert")).toHaveTextContent("Your team's templates couldn't be loaded.")
    expect(screen.getAllByRole("option")).toHaveLength(10)
  })
})
