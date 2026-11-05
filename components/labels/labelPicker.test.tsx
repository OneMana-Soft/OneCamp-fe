import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The reads go through useFetch (SWR); each key answers as the server would.
const reads = vi.hoisted(() => ({ byKey: {} as Record<string, unknown>, failed: new Set<string>(), mutate: vi.fn() }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({
    data: url && !reads.failed.has(url) ? reads.byKey[url] : undefined,
    isError: url && reads.failed.has(url) ? new Error("down") : undefined,
    isLoading: false,
    mutate: reads.mutate,
  }),
}))
const appMutate = vi.hoisted(() => vi.fn())
vi.mock("@/lib/swrMutate", () => ({ appMutate }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import LabelPicker from "./LabelPicker"
import { useItemLabel, useLabelling } from "./labelData"
import { SensitivityChip } from "./labelMarks"
import { NoLabelsYet } from "./noLabels"
import type { LabelHttp, LabelKind, SensitivityLabel } from "@/lib/labels/labels"

const RULES = [
  { key: "no_guest_links", name: "No guest links" },
  { key: "no_export", name: "No exports" },
]
const CONFIDENTIAL: SensitivityLabel = { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_guest_links", "no_export"] }
const INTERNAL: SensitivityLabel = { id: "l-i", name: "Internal", colour: "amber", rank: 1, rules: ["no_guest_links"] }
const LOWER = "Only the board's owner or a workspace admin can lower or remove its label “Confidential”."

function http(put: (url: string, body: unknown) => unknown) {
  return { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(async (url: string, body: unknown) => ({ data: await put(url, body) })) } as unknown as LabelHttp & { put: ReturnType<typeof vi.fn> }
}

// The picker as a page mounts it: the page's hook reads and writes, the picker presents (./labelData).
function Picker({ kind, id, onClose, http }: { kind: LabelKind; id: string; onClose: () => void; http: LabelHttp }) {
  const labelling = useLabelling(kind, id, true, http)
  return <LabelPicker labelling={labelling} empty={<NoLabelsYet />} onClose={onClose} />
}

// The chip as a page mounts it: the label from the page's hook, nothing when the item carries none.
function Chip({ kind, id, onOpen }: { kind: LabelKind; id: string; onOpen?: () => void }) {
  const label = useItemLabel(kind, id)
  return label ? <SensitivityChip label={label} onOpen={onOpen} /> : null
}

beforeEach(() => {
  reads.byKey = { "/labels": { data: { labels: [INTERNAL, CONFIDENTIAL], rules: RULES } }, "/labels/items/board/b-1": { data: null } }
  reads.failed.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the label picker (miro-44 L)", () => {
  it("lists the workspace's labels highest first with their rules, then No label, and puts the one chosen on the item", async () => {
    const h = http(() => ({ msg: "ok", data: CONFIDENTIAL }))
    const onClose = vi.fn()
    render(<Picker kind="board" id="b-1" onClose={onClose} http={h} />)
    const options = screen.getAllByRole("radio")
    expect(options.map((o) => o.getAttribute("data-label-option"))).toEqual(["Confidential", "Internal", "none"])
    expect(options[0].textContent).toContain("No guest links · No exports")
    expect(screen.getByRole("radio", { name: /No label/ }).getAttribute("aria-checked")).toBe("true")
    // Nothing chosen yet that differs: Save waits.
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(options[0])
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(h.put).toHaveBeenCalledWith("/labels/items/board/b-1", { label_id: "l-c" }, { suppressErrorToast: true })
    // The chip, the share and the export dialogs read this key: they follow at once, without a read.
    expect(appMutate).toHaveBeenCalledWith("/labels/items/board/b-1", { data: CONFIDENTIAL }, { revalidate: false })
    expect(toast).toHaveBeenCalledWith({ title: "Labelled Confidential" })
  })

  it("takes a label off with No label, and says a lowering the server refuses in its own words, staying open", async () => {
    reads.byKey["/labels/items/board/b-1"] = { data: CONFIDENTIAL }
    const h = http(() => {
      throw Object.assign(new Error("Request failed with status code 403"), { isAxiosError: true, response: { status: 403, data: { code: "label_owner_lowers", msg: LOWER } } })
    })
    const onClose = vi.fn()
    render(<Picker kind="board" id="b-1" onClose={onClose} http={h} />)
    expect(screen.getByRole("radio", { name: /Confidential/ }).getAttribute("aria-checked")).toBe("true")
    fireEvent.click(screen.getByRole("radio", { name: /No label/ }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect((await screen.findByRole("alert")).textContent).toBe(LOWER)
    expect(h.put).toHaveBeenCalledWith("/labels/items/board/b-1", { label_id: null }, { suppressErrorToast: true })
    expect(onClose).not.toHaveBeenCalled()
    expect(appMutate).not.toHaveBeenCalled()
  })

  it("still shows a label removed since it went on, so the person sees what they'd change", () => {
    const old = { ...CONFIDENTIAL, id: "l-old", name: "Old secret" }
    reads.byKey["/labels/items/board/b-1"] = { data: old }
    render(<Picker kind="board" id="b-1" onClose={() => {}} http={http(() => ({}))} />)
    const options = screen.getAllByRole("radio").map((o) => o.getAttribute("data-label-option"))
    expect(options).toEqual(["Old secret", "Confidential", "Internal", "none"])
  })

  it("says where labels come from when the workspace has none, and offers Try again when they can't be read", () => {
    reads.byKey["/labels"] = { data: { labels: [], rules: RULES } }
    const { unmount } = render(<Picker kind="doc" id="d-1" onClose={() => {}} http={http(() => ({}))} />)
    expect(screen.getByText("No labels yet")).toBeTruthy()
    expect(screen.getByText(/A workspace admin adds labels in Settings, under Security/)).toBeTruthy()
    expect(screen.queryAllByRole("radio")).toHaveLength(0)
    unmount()
    reads.failed.add("/labels")
    render(<Picker kind="doc" id="d-1" onClose={() => {}} http={http(() => ({}))} />)
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(reads.mutate).toHaveBeenCalled()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe("the label chip (miro-44 L)", () => {
  it("shows nothing for an item with no label, a plain mark for someone who can't change it, and a button for someone who can", () => {
    const { container, unmount } = render(<Chip kind="board" id="b-1" />)
    expect(container.innerHTML).toBe("")
    unmount()
    // An answer that isn't a label (a stub's empty object) shows nothing either: a label is never guessed.
    reads.byKey["/labels/items/board/b-1"] = { msg: "ok", data: {} }
    const empty = render(<Chip kind="board" id="b-1" />)
    expect(empty.container.innerHTML).toBe("")
    empty.unmount()
    reads.byKey["/labels/items/board/b-1"] = { data: CONFIDENTIAL }
    const view = render(<Chip kind="board" id="b-1" />)
    const mark = view.container.querySelector("[data-item-label]")!
    expect(mark.tagName).toBe("SPAN")
    expect(mark.textContent).toBe("Confidential")
    expect(mark.getAttribute("title")).toBe("Labelled Confidential: No guest links · No exports")
    view.unmount()
    const onOpen = vi.fn()
    render(<Chip kind="board" id="b-1" onOpen={onOpen} />)
    fireEvent.click(screen.getByRole("button", { name: "Label: Confidential. Change the label" }))
    expect(onOpen).toHaveBeenCalled()
  })
})
