import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"

// The page's own reads: the doc's details and the profile.
let doc: Record<string, unknown> | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url === "/doc/getDocInfo/d1" && doc ? { data: doc } : undefined }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam" } } }),
}))
const loadConsent = vi.fn<(id: string) => Promise<void>>(async () => {})
vi.mock("./consent", () => ({ loadConsent: (id: string) => loadConsent(id) }))

const ConsentPrefetch = (await import("./ConsentPrefetch")).default

afterEach(() => {
  cleanup()
  loadConsent.mockClear()
  doc = undefined
})

// Every doc page asked for its export consent as it opened, for everyone; only
// the owner of a private doc has a switch to show, so only they ask.
describe("reading a doc's export consent as it opens", () => {
  it("asks for the owner of a private doc, and for nobody else", () => {
    render(<ConsentPrefetch docId="d1" />)
    expect(loadConsent).not.toHaveBeenCalled()

    for (const [d, asks] of [
      [{ doc_private: true, doc_created_by: { user_uuid: "u-sam" } }, true],
      [{ doc_private: false, doc_created_by: { user_uuid: "u-sam" } }, false],
      [{ doc_private: true, doc_created_by: { user_uuid: "u-kim" } }, false],
      // Handed over: the new owner asks, and its maker no longer does.
      [{ doc_private: true, doc_created_by: { user_uuid: "u-kim" }, doc_owner: { user_uuid: "u-sam" } }, true],
      [{ doc_private: true, doc_created_by: { user_uuid: "u-sam" }, doc_owner: { user_uuid: "u-kim" } }, false],
    ] as const) {
      cleanup()
      loadConsent.mockClear()
      doc = d
      render(<ConsentPrefetch docId="d1" />)
      expect(loadConsent.mock.calls).toEqual(asks ? [["d1"]] : [])
    }
  })
})
