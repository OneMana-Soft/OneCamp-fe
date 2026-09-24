import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// A shared document must have exactly one source: the collaboration server,
// which rebuilds it from the stored HTML on every load.
//
// Two client paths made a second, unrelated copy of the same content, and
// Yjs merges unrelated copies side by side rather than reconciling them, so
// every block appeared twice and the doubled document was saved back. Proven
// with the service's own libraries: three blocks became six. One path was a
// timer that seeded the editor from HTML when sync took longer than 800 ms;
// the other was an IndexedDB copy kept from an earlier load.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8")

describe("a shared document has one source", () => {
  it("keeps no local copy of the shared document", () => {
    const src = read("./useCollaborationProvider.ts")
    expect(src).not.toMatch(/IndexeddbPersistence|from ['"]y-indexeddb['"]/)
    expect(src).toContain("indexedDB.deleteDatabase(documentId)")
  })

  it("never seeds a collaborative editor from HTML", () => {
    const src = read("../components/minimal-tiptap/hooks/use-minimal-tiptap.ts")
    const create = src.slice(src.indexOf("const handleCreate"), src.indexOf("const handleBlur"))
    const collaborative = create.slice(create.indexOf("if (!collaboration?.enabled)"))
    const afterReturn = collaborative.slice(collaborative.indexOf("return\n"))
    expect(afterReturn).not.toMatch(/setContent|setTimeout/)
  })
})
