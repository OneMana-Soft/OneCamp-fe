import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The record's read of the row's page, as useFetch answers it.
const read = vi.hoisted(() => ({ data: undefined as unknown, isError: undefined as unknown, mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useFetch")>()),
  useFetch: () => ({ data: read.data, isError: read.isError, isLoading: !read.data && !read.isError, mutate: read.mutate }),
}))
const ensure = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  ensureRowPage: (...a: unknown[]) => ensure(...a),
}))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))
// The editor is its own chunk: a stand-in that shows what it's handed.
vi.mock("@/components/table/rowPage/RowPageEditor", () => {
  function RowPageEditorStandIn(p: { docId: string; body: string; level: string; autoFocus?: boolean }) {
    return <div data-testid="row-page-editor" data-doc={p.docId} data-body={p.body} data-level={p.level} data-focus={String(!!p.autoFocus)} />
  }
  return { default: RowPageEditorStandIn }
})

import RowPage from "@/components/table/rowPage/RowPage"

afterEach(() => {
  cleanup()
  read.data = undefined
  read.isError = undefined
  read.mutate.mockReset()
  ensure.mockReset()
  toast.mockReset()
})

describe("a row's page", () => {
  it("opens its page's editor with its saved body", async () => {
    read.data = { data: { doc_uuid: "d1", body: "<p>Call on Friday.</p>", level: "edit" } }
    render(<RowPage tableId="t" rowId="r1" page="d1" />)
    const editor = await screen.findByTestId("row-page-editor")
    expect(editor.dataset.doc).toBe("d1")
    expect(editor.dataset.body).toBe("<p>Call on Friday.</p>")
    expect(editor.dataset.level).toBe("edit")
    expect(editor.dataset.focus).toBe("false")
  })

  it("offers a page to someone who may write one, and opens it with the cursor in it", async () => {
    read.data = { data: { level: "edit" } }
    ensure.mockResolvedValue({ doc_uuid: "d2", made: true })
    render(<RowPage tableId="t" rowId="r1" />)
    expect(screen.queryByTestId("row-page-editor")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Write a page for this row/ }))
    const editor = await screen.findByTestId("row-page-editor")
    expect(ensure).toHaveBeenCalledWith("t", "r1")
    expect(editor.dataset.doc).toBe("d2")
    expect(editor.dataset.body).toBe("")
    expect(editor.dataset.focus).toBe("true")
  })

  it("offers nothing to someone who may only read the row", () => {
    read.data = { data: { level: "view" } }
    const { container } = render(<RowPage tableId="t" rowId="r1" />)
    expect(container.textContent).toBe("")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("says so when the page couldn't be started, and loses nothing", async () => {
    read.data = { data: { level: "edit" } }
    ensure.mockRejectedValue(new Error("Network Error"))
    render(<RowPage tableId="t" rowId="r1" />)
    fireEvent.click(screen.getByRole("button", { name: /Write a page for this row/ }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't start the page", variant: "destructive" })))
    expect(screen.getByRole("button", { name: /Write a page for this row/ })).toBeTruthy()
  })

  it("says when it couldn't be read, with Try again", () => {
    read.isError = new Error("Network Error")
    render(<RowPage tableId="t" rowId="r1" />)
    expect(screen.getByRole("alert").textContent).toContain("Couldn't read this row's page.")
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(read.mutate).toHaveBeenCalled()
  })

  // Someone else gave the row a page while this record showed none: the
  // record reads it again for the page.
  it("reads again when the row says it has a page the read hadn't seen", () => {
    read.data = { data: { level: "edit" } }
    render(<RowPage tableId="t" rowId="r1" page="d3" />)
    expect(read.mutate).toHaveBeenCalled()
  })
})
