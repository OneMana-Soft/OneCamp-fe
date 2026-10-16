import { describe, expect, it } from "vitest"

import { docFileOf, guestShareToken, viewableFileUrl } from "./docFiles"

// B13: a guest has no session, so a doc's own files reach them through their
// link; everyone else, and every other address, is left as it is.
describe("a doc's files", () => {
  const doc = "6f0c2b1e-3d4a-4b5c-8d6e-7f8091a2b3c4"
  const obj = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
  const src = `https://api.example.test/doc/getDocAttachment/${doc}/${obj}`

  it("reads the doc and the object from a doc file's address", () => {
    expect(docFileOf(src)).toEqual({ docId: doc, objectUuid: obj })
    expect(docFileOf(`/doc/getDocAttachment/${doc}/${obj}?r=2`)).toEqual({ docId: doc, objectUuid: obj })
    expect(docFileOf("https://cdn.example.com/a.png")).toBeNull()
    expect(docFileOf(null)).toBeNull()
  })

  it("finds the share link's token on the guest's page only", () => {
    expect(guestShareToken("/guest/d/abc%20123")).toBe("abc 123")
    expect(guestShareToken("/app/doc/1")).toBeNull()
  })

  it("sends a guest through their link, and no one else", () => {
    expect(viewableFileUrl(src, true, "tok")).toMatch(new RegExp(`/guest/doc-attachment/tok/${obj}$`))
    expect(viewableFileUrl(src, false, "tok")).toBe(src)
    expect(viewableFileUrl("https://cdn.example.com/a.png", true, "tok")).toBe("https://cdn.example.com/a.png")
    expect(viewableFileUrl(src, true, null)).toBe(src)
  })
})
