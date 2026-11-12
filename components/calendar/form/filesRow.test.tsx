import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The Event Form's Linked row (calendar head B, gcal-1a; EVLINK head B, gcal-15): Add from OneCamp (the one
// entity-link search, offering docs, boards and tasks), Upload (into your own Files, then on the event as the doc it
// makes), the chips with Remove, the 25 limit said in words, and both adds off while the app is offline.
const uploadFiles = vi.hoisted(() => vi.fn())
const net = vi.hoisted(() => ({ offline: false, kinds: [] as unknown[] }))
vi.mock("@/lib/connectivity", async (actual) => ({ ...(await actual<object>()), isAppOffline: () => net.offline }))
vi.mock("@/components/docFiles/uploads", () => ({ uploadFiles }))
vi.mock("@/components/calendar/fileChips", () => ({
  FileChips: ({ files, onRemove }: { files: Array<{ kind: string; uuid: string }>; onRemove?: (f: unknown) => void }) => (
    <ul>
      {files.map((f) => (
        <li key={f.uuid} data-file={f.uuid}>
          <button type="button" onClick={() => onRemove?.(f)}>{`Remove ${f.uuid}`}</button>
        </li>
      ))}
    </ul>
  ),
}))
vi.mock("@/components/entityLink/EntityLinkSearch", () => ({
  EntityLinkSearch: ({ onPick, isLinked, kinds }: { onPick: (k: string, id: string, t: string) => void; isLinked: (k: string, id: string) => boolean; kinds?: unknown[] }) => {
    net.kinds = kinds ?? []
    return (
      <>
        <button type="button" data-linked={isLinked("doc", "d1") || undefined} onClick={() => onPick("board", "b1", "Launch plan")}>
          Launch plan
        </button>
        <button type="button" data-linked={isLinked("task", "t1") || undefined} onClick={() => onPick("task", "t2", "Book the venue")}>
          Book the venue
        </button>
      </>
    )
  },
}))

import { FilesRow } from "@/components/calendar/form/filesRow"

afterEach(() => {
  cleanup()
  uploadFiles.mockReset()
  net.offline = false
})

const D1 = { kind: "doc", uuid: "d1" } as const

describe("the form's Linked row", () => {
  it("adds a doc or a board from OneCamp through the doc and board search, which knows what it has", async () => {
    const onChange = vi.fn()
    render(<FilesRow files={[D1]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Add from OneCamp" }))
    const found = await screen.findByRole("button", { name: "Launch plan" }, { timeout: 5000 })
    expect(found.getAttribute("data-linked")).toBe("true")
    fireEvent.click(found)
    expect(onChange).toHaveBeenCalledWith([D1, { kind: "board", uuid: "b1" }])
  })

  it("links a task through the same search, which offers docs, boards and tasks and knows a linked task", async () => {
    const onChange = vi.fn()
    render(<FilesRow files={[D1, { kind: "task", uuid: "t1" }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Add from OneCamp" }))
    const found = await screen.findByRole("button", { name: "Book the venue" }, { timeout: 5000 })
    expect(net.kinds).toEqual(["doc", "board", "task"])
    expect(found.getAttribute("data-linked")).toBe("true")
    fireEvent.click(found)
    expect(onChange).toHaveBeenCalledWith([D1, { kind: "task", uuid: "t1" }, { kind: "task", uuid: "t2" }])
  })

  it("with nothing linked, is its adds alone: no list, no count", () => {
    render(<FilesRow files={[]} onChange={vi.fn()} />)
    expect(screen.queryByRole("list")).toBeNull()
    expect((screen.getByRole("button", { name: "Add from OneCamp" }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByText(/offline/)).toBeNull()
  })

  it("while the app is offline, both adds are off and the row says why", () => {
    net.offline = true
    render(<FilesRow files={[D1]} onChange={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Add from OneCamp" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("You're offline. Link a doc, a board or a task once you're back.")).toBeTruthy()
  })

  it("uploads a file into your own Files and carries it as the doc it made", async () => {
    const onChange = vi.fn()
    uploadFiles.mockResolvedValue([{ kind: "file", uuid: "n1", title: "Brief.pdf" }])
    render(<FilesRow files={[D1]} onChange={onChange} />)
    const input = document.querySelector("input[type='file']") as HTMLInputElement
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy()
    const file = new File(["x"], "Brief.pdf", { type: "application/pdf" })
    fireEvent.change(input, { target: { files: [file] } })
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([D1, { kind: "doc", uuid: "n1" }]))
    expect(uploadFiles).toHaveBeenCalledWith([file], { space: "private" }, "your Files")
  })

  it("takes one off", () => {
    const onChange = vi.fn()
    render(<FilesRow files={[D1, { kind: "board", uuid: "b2" }]} onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove d1" }))
    expect(onChange).toHaveBeenCalledWith([{ kind: "board", uuid: "b2" }])
  })

  it("stops at 25 and says so", () => {
    const full = Array.from({ length: 25 }, (_, i) => ({ kind: "doc" as const, uuid: `u${i}` }))
    render(<FilesRow files={full} onChange={vi.fn()} />)
    expect((screen.getByRole("button", { name: "Add from OneCamp" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Upload" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("An event carries up to 25 files. Take one off to add another.")).toBeTruthy()
  })
})
