import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Who may change a label from its chip (miro-44 L, CR-216 M1): someone who can
// edit the board or the doc gets a button that opens the picker; anyone else,
// a viewer, sees a plain mark that opens nothing. The server refuses a
// viewer's put anyway; this holds the page to the same rule.

const reads = vi.hoisted(() => ({ byKey: {} as Record<string, unknown> }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url ? reads.byKey[url] : undefined, isError: undefined, isLoading: false, mutate: vi.fn() }),
}))
const docs = vi.hoisted(() => ({ editAccess: 0, emit: vi.fn() }))
vi.mock("@/components/docEditor/chrome/useDoc", () => ({ useDoc: () => ({ doc_uuid: "d-1", doc_edit_access: docs.editAccess }) }))
vi.mock("@/components/docEditor/registry/docBusContext", () => ({ useDocBus: () => ({ emit: docs.emit }) }))

import BoardLabel from "./boardLabel"
import DocLabelChip from "./docLabelChip"
import { NoLabelsYet } from "./noLabels"
import type { Labelling } from "@/lib/labels/labelTypes"
import type { SensitivityLabel } from "@/lib/labels/labels"

const CONFIDENTIAL: SensitivityLabel = { id: "l-c", name: "Confidential", colour: "red", rank: 2, rules: ["no_guest_links", "no_export"] }
const CHANGE = "Label: Confidential. Change the label"
const labelling = { kind: "board", label: CONFIDENTIAL, labels: { catalogue: null, loading: true, failed: false, retry: () => {} }, save: vi.fn() } as unknown as Labelling

beforeEach(() => {
  reads.byKey = { "/labels/items/doc/d-1": { data: CONFIDENTIAL } }
  docs.editAccess = 0
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("a label's chip opens the picker only for someone who can edit the item (miro-44 L)", () => {
  it("on a board: a viewer sees a plain mark that opens nothing; an editor's chip opens the picker", () => {
    const onOpen = vi.fn()
    const view = render(<BoardLabel labelling={labelling} edit={false} open={false} onOpen={onOpen} empty={<NoLabelsYet />} />)
    const mark = view.container.querySelector("[data-item-label]")!
    expect(mark.textContent).toBe("Confidential")
    expect(screen.queryByRole("button")).toBeNull()
    fireEvent.click(mark)
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.queryByRole("radio")).toBeNull()
    view.unmount()

    render(<BoardLabel labelling={labelling} edit open={false} onOpen={onOpen} empty={<NoLabelsYet />} />)
    fireEvent.click(screen.getByRole("button", { name: CHANGE }))
    expect(onOpen).toHaveBeenCalledWith(true)
  })

  it("on a doc: someone without edit access sees a plain mark that opens nothing; an editor's chip opens the label dialog", () => {
    const view = render(<DocLabelChip docId="d-1" />)
    const mark = view.container.querySelector("[data-item-label]")!
    expect(mark.textContent).toBe("Confidential")
    expect(screen.queryByRole("button")).toBeNull()
    fireEvent.click(mark)
    expect(docs.emit).not.toHaveBeenCalled()
    view.unmount()

    docs.editAccess = 1
    render(<DocLabelChip docId="d-1" />)
    fireEvent.click(screen.getByRole("button", { name: CHANGE }))
    expect(docs.emit).toHaveBeenCalledWith("openDialog", { id: "doc.label" })
  })
})
