import { describe, expect, it } from "vitest"
import { readSearchWithin, searchWithinHref, withinParam } from "./within"
import { GlobalSearchGet } from "@/services/searchService"

// A channel header's Search opened the whole workspace's search, with the
// channel lost (QA F-15). Search in one conversation is one parameter, the
// same for the page's address and the server's request.
describe("search within a conversation", () => {
  it("opens the search page on the conversation, with or without words", () => {
    expect(searchWithinHref({ kind: "channel", id: "c1" })).toBe("/app/search?channel=c1")
    expect(searchWithinHref({ kind: "dm", id: "maya" }, " launch plan ")).toBe("/app/search?query=launch%20plan&dm=maya")
    expect(searchWithinHref({ kind: "group", id: "a b" })).toBe("/app/search?group=a%20b")
  })

  it("reads the conversation back from the address, and nothing from an address without one", () => {
    expect(readSearchWithin(new URLSearchParams("query=launch&channel=c1"))).toEqual({ kind: "channel", id: "c1" })
    expect(readSearchWithin(new URLSearchParams("group=g1"))).toEqual({ kind: "group", id: "g1" })
    expect(readSearchWithin(new URLSearchParams("query=launch&in=docs"))).toBeNull()
    expect(readSearchWithin(new URLSearchParams("channel=%20"))).toBeNull()
    expect(withinParam(null)).toBe("")
  })

  it("asks the server for the conversation alone", () => {
    expect(GlobalSearchGet("launch", { kind: "channel", id: "c1" })).toBe("/search/unifiedSearch/launch?channel=c1")
    expect(GlobalSearchGet("launch")).toBe("/search/unifiedSearch/launch")
  })
})
