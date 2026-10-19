import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The doc's live session, as the server decided it.
const session = vi.hoisted(() => ({
  value: {
    provider: {} as unknown,
    synced: false,
    activeUsers: 1,
    access: { level: "edit", canEdit: true, locked: false },
    refused: null as string | null,
  },
}))
vi.mock("@/hooks/useDocSession", () => ({ useDocSession: () => session.value }))
vi.mock("@/hooks/useFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useFetch")>()),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam", user_full_name: "Sam Rivera", user_name: "sam" } } }),
}))
vi.mock("@/lib/collabToken", () => ({ warmCollabToken: () => {} }))
vi.mock("@/components/docEditor/registry", () => ({}))
// The doc's own editor: a stand-in that keeps what it's handed.
const editor = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }))
vi.mock("@/components/docEditor/docInput", () => {
  function DocInputStandIn(p: Record<string, unknown>) {
    editor.props = p
    return <div data-testid="doc-input" />
  }
  return { default: DocInputStandIn }
})

import RowPageEditor from "@/components/table/rowPage/RowPageEditor"

afterEach(() => {
  cleanup()
  editor.props = null
  session.value = { provider: {}, synced: false, activeUsers: 1, access: { level: "edit", canEdit: true, locked: false }, refused: null }
})

describe("a row's page's editor", () => {
  // A row's page is the doc's own editor, bound to its live session, drawn
  // as a hosted doc: no doc page layers, no comments, sharing or Ask AI on
  // it, all of which a row's page's paths refuse.
  it("is the doc's editor for the page, as a hosted doc with only writing and reading", () => {
    render(<RowPageEditor docId="d1" body="<p>Call on Friday.</p>" level="edit" />)
    const p = editor.props!
    expect(screen.getByTestId("doc-input")).toBeTruthy()
    expect(p.docId).toBe("d1")
    expect(p.value).toBe("<p>Call on Friday.</p>")
    expect(p.editable).toBe(true)
    expect(p.hosted).toBe(true)
    expect(p.editableTitle).toBe(false)
    const a = p.abilities as { level: string; edit: boolean; comment: boolean; share: boolean; askRead: boolean; askWrite: boolean; canAsk: (x: string) => boolean }
    expect(a.edit).toBe(true)
    expect(a.comment).toBe(false)
    expect(a.share).toBe(false)
    expect(a.askRead).toBe(false)
    expect(a.askWrite).toBe(false)
    expect(a.canAsk("rewrite")).toBe(false)
  })

  it("reads, and doesn't write, where the server says so", () => {
    session.value = { ...session.value, access: { level: "view", canEdit: false, locked: false } }
    render(<RowPageEditor docId="d1" body="<p>Call on Friday.</p>" level="view" />)
    expect(editor.props!.editable).toBe(false)
    expect((editor.props!.abilities as { edit: boolean }).edit).toBe(false)
  })

  it("says so when its row went to the trash", () => {
    session.value = { ...session.value, refused: "gone" }
    render(<RowPageEditor docId="d1" body="" level="edit" />)
    expect(screen.getByRole("status").textContent).toBe("This row's page went to the trash with the row.")
    expect(editor.props).toBeNull()
  })
})
