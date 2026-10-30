import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { CONTENT_IO_JOB_EVENT, type ContentIOJob } from "@/lib/export/contentIO"
import { SHEET_EXTENSIONS } from "@/lib/tables/sheetImport"
import { pinTestClock } from "@/lib/testing/testClock"

// A job carries the day it was made.
pinTestClock()

const startImport = vi.fn()
const chooseImport = vi.fn()
const getJob = vi.fn()
vi.mock("@/lib/export/contentIO", async (original) => ({
  ...(await original<typeof import("@/lib/export/contentIO")>()),
  loadCapabilities: async () => ({ export: true, export_formats: [], import_extensions: [".docx", ".md", ".markdown", ".txt", ".html", ".htm", ".zip"], max_import_bytes: 1000, max_direct_bytes: 500 }),
  startImport: (...a: unknown[]) => startImport(...a),
  chooseImport: (...a: unknown[]) => chooseImport(...a),
  getJob: (...a: unknown[]) => getJob(...a),
}))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
// The table a sheet comes into: its fields, as its page's request reads them.
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({
    data: key ? { data: [{ id: "f_item", table_id: "t1", name: "Item", type: "text", config: "{}", position: 0 }] } : undefined,
  }),
}))

import { ImportSheetDialog } from "./ImportSheetDialog"

afterEach(() => {
  cleanup()
  for (const f of [startImport, chooseImport, getJob, push]) f.mockReset()
})

const job = (patch: Partial<ContentIOJob>): ContentIOJob => ({ id: "job-1", kind: "import", format: "sheet", status: "queued", progress: 0, created_at: "2026-10-25T00:00:00Z", ...patch })
const preview = (into?: string) => ({
  signs: { decimal: ".", group: "," },
  day_first: true,
  zone: "UTC",
  sheets: [
    {
      index: 0,
      name: "deals",
      rows: 2,
      ...(into ? { into } : {}),
      fields: [
        { key: "c0", name: "Item", type: "text", ...(into ? { field: "f_item" } : {}) },
        { key: "c1", name: "Amount", type: "number", ...(into ? { leave: true } : {}) },
      ],
      sample: [
        ["Booth", "1200"],
        ["Banner", "300"],
      ],
    },
  ],
})
const csv = () => new File(["Item,Amount\nBooth,1200\nBanner,300\n"], "deals.csv", { type: "text/csv" })
const choose = (file: File) => fireEvent.change(document.querySelector<HTMLInputElement>("[data-import-input]")!, { target: { files: [file] } })

describe("a spreadsheet into tables", () => {
  it("shows the columns the server found, and makes the tables as the person chose", async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: "ready", preview: preview() }))
    render(<ImportSheetDialog onClose={() => {}} />)
    choose(csv())
    await waitFor(() => expect(startImport).toHaveBeenCalled())
    expect(startImport.mock.calls[0][3]).toBe("table")
    expect(startImport.mock.calls[0][4]).toMatchObject({ zone: expect.any(String) })

    const amount = await screen.findByRole("textbox", { name: "Name of column 2" }, { timeout: 4000 })
    expect(screen.getByText("Booth · Banner")).toBeTruthy()
    fireEvent.change(amount, { target: { value: "Budget" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "Bring Item" }))

    chooseImport.mockResolvedValue(job({ status: "running", progress: 10 }))
    getJob.mockResolvedValue(job({ status: "done", progress: 100, made: 2, created: [{ kind: "table", uuid: "t9", title: "deals" }], show: { kind: "table", uuid: "t9", title: "deals" } }))
    fireEvent.click(screen.getByRole("button", { name: "Import 2 rows" }))
    await waitFor(() => expect(chooseImport).toHaveBeenCalled())
    const [id, sent, confirm] = chooseImport.mock.calls[0]
    expect([id, confirm]).toEqual(["job-1", true])
    expect(sent.sheets[0].fields).toEqual([
      { key: "c0", name: "Item", type: "text", leave: true },
      { key: "c1", name: "Budget", type: "number", leave: false },
    ])

    fireEvent.click(await screen.findByRole("button", { name: "Open deals" }, { timeout: 4000 }))
    expect(push).toHaveBeenCalledWith("/app/tables/t9")
  })

  it("brings a sheet's rows into the person's table, its columns into its fields", async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockResolvedValue(job({ status: "ready", preview: preview("t1") }))
    render(<ImportSheetDialog into={{ id: "t1", name: "Deals" }} onClose={() => {}} />)
    expect(screen.getByRole("dialog", { name: "Import rows into Deals" })).toBeTruthy()
    choose(csv())
    await waitFor(() => expect(startImport).toHaveBeenCalled())
    expect(startImport.mock.calls[0][4]).toMatchObject({ sheets: [{ index: 0, into: "t1" }] })

    await screen.findByRole("combobox", { name: "Field for Item" }, { timeout: 4000 })
    chooseImport.mockResolvedValue(job({ status: "running" }))
    getJob.mockResolvedValue(job({ status: "done", made: 2, show: { kind: "table", uuid: "t1", title: "Deals" } }))
    fireEvent.click(screen.getByRole("button", { name: "Import 2 rows" }))
    await waitFor(() => expect(chooseImport).toHaveBeenCalled())
    expect(chooseImport.mock.calls[0][1].sheets[0]).toEqual({
      index: 0,
      bring: true,
      into: "t1",
      match_by: "",
      fields: [
        { key: "c0", field: "f_item", leave: false },
        { key: "c1", field: "", leave: true },
      ],
    })
    expect(await screen.findByText("2 rows imported into Deals.", {}, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy()
  })

  it("says in the server's words why a file can't come, and lets the person pick another", async () => {
    startImport.mockRejectedValue({ isAxiosError: true, response: { status: 403, data: { msg: "You can't make tables in this workspace." } } })
    render(<ImportSheetDialog onClose={() => {}} />)
    choose(csv())
    expect((await screen.findByRole("alert")).textContent).toBe("You can't make tables in this workspace.")
    expect(document.querySelector("[data-import-input]")).toBeTruthy()
    expect(chooseImport).not.toHaveBeenCalled()
  })

  // The demo, 26 Oct: the dialog kept only the sheet files the capabilities name, and the server's name a doc
  // import's files (the stub's list is its answer), so once they had come every sheet was refused.
  it("takes a sheet once the server's capabilities are in, though they name only a doc import's files", async () => {
    startImport.mockReturnValue(new Promise(() => {}))
    render(<ImportSheetDialog onClose={() => {}} />)
    await act(async () => {})
    choose(csv())
    await waitFor(() => expect(startImport).toHaveBeenCalled())
    expect(screen.queryByRole("alert")).toBeNull()
  })

  // Its words once named four of the five (26 Oct: .xlsm was left out).
  it("takes no file a spreadsheet import doesn't read, and names every one it does", async () => {
    render(<ImportSheetDialog onClose={() => {}} />)
    const offer = screen.getByText(/becomes tables of your own/).textContent
    choose(new File(["# Plan"], "plan.md", { type: "text/markdown" }))
    const refusal = (await screen.findByRole("alert")).textContent
    expect(refusal).toMatch(/can't be imported/)
    cleanup()
    render(<ImportSheetDialog into={{ id: "t1", name: "Deals" }} onClose={() => {}} />)
    const intoTable = screen.getByText(/added to this table/).textContent
    for (const x of SHEET_EXTENSIONS) for (const words of [offer, refusal, intoTable]) expect(words).toContain(x)
    expect(startImport).not.toHaveBeenCalled()
  })

  it("says when the server no longer answers for the import, and lets the person pick another file", async () => {
    startImport.mockResolvedValue(job({}))
    getJob.mockRejectedValue({ response: { status: 404, data: {} } })
    render(<ImportSheetDialog onClose={() => {}} />)
    choose(csv())
    expect(await screen.findByText("This import can't be followed any more.", undefined, { timeout: 4000 })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Choose another file" })).toBeTruthy()
  })

  it("waits for a read of the job when the news that it's ready came without its preview", async () => {
    startImport.mockResolvedValue(job({}))
    // The first read is lost; the next brings the preview.
    getJob.mockRejectedValueOnce({ response: { status: 503, data: {} } }).mockResolvedValue(job({ status: "ready", preview: preview() }))
    render(<ImportSheetDialog onClose={() => {}} />)
    choose(csv())
    await waitFor(() => expect(startImport).toHaveBeenCalled())
    await act(async () => {})
    act(() => void window.dispatchEvent(new CustomEvent(CONTENT_IO_JOB_EVENT, { detail: job({ status: "ready" }) })))
    expect(await screen.findByRole("textbox", { name: "Name of column 2" }, { timeout: 5000 })).toBeTruthy()
    expect(getJob.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
