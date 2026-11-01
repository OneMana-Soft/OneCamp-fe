import { describe, expect, it } from "vitest"
import { inScope, PALETTE_SCOPES, scopedText, scopeWords, searchPageHref, typedScope } from "@/lib/search/scopePrefix"
import { SCOPE_KINDS } from "@/lib/search/queryApi"
import { isScope } from "@/lib/search/scopes"

// linear-28 to_win 2: a letter and a space typed into the palette's empty field
// narrow it to one kind, as Linear's i/p/u/d do. Each scope is one of the
// search page's, so the kinds asked for, the rows kept and the full search's
// chip all come from the one table.

describe("the palette's scope prefixes", () => {
  it("reads a letter and a space as its scope, in either case", () => {
    expect(typedScope("t ")).toBe("tasks")
    expect(typedScope("p ")).toBe("projects")
    expect(typedScope("u ")).toBe("people")
    expect(typedScope("d ")).toBe("docs")
    expect(typedScope("c ")).toBe("channels")
    // A phone's keyboard capitalises the field's first letter.
    expect(typedScope("T ")).toBe("tasks")
  })

  it("leaves anything else as words", () => {
    // Not "i": a question typed to search or ask starts "I …".
    for (const text of ["i ", "I ", "t", " t ", "t  ", "t x", "tt ", "x ", "", "  "]) expect(typedScope(text), JSON.stringify(text)).toBeNull()
  })

  it("names only the search page's scopes, each once", () => {
    const prefixes = PALETTE_SCOPES.map((s) => s.prefix)
    expect(new Set(prefixes).size).toBe(prefixes.length)
    for (const s of PALETTE_SCOPES) expect(isScope(s.scope), s.scope).toBe(true)
  })

  it("says a scope as the search page's chip does", () => {
    expect(scopeWords("tasks")).toEqual({ label: "Tasks", plural: "tasks" })
    expect(scopeWords("people")).toEqual({ label: "People", plural: "people" })
  })
})

describe("what a scope asks the server", () => {
  it("writes one type: per kind of the scope ahead of the words", () => {
    expect(scopedText("launch", "tasks")).toBe("type:task launch")
    // Two kinds: the grammar merges a field written twice into one OR.
    expect(scopedText("launch", "docs")).toBe("type:doc type:board launch")
    expect(scopedText(" launch ", "people")).toBe("type:person launch")
    expect(scopedText("", "tasks")).toBe("type:task")
  })

  it("takes every scope's kinds from the search page's table", () => {
    for (const { scope } of PALETTE_SCOPES) {
      expect(scopedText("q4", scope)).toBe([...SCOPE_KINDS[scope].map((k) => `type:${k}`), "q4"].join(" "))
    }
  })

  it("leaves the words alone with no scope", () => {
    expect(scopedText(" launch ", null)).toBe("launch")
    expect(scopedText("launch", undefined)).toBe("launch")
    expect(scopedText("launch", "all")).toBe("launch")
  })
})

describe("the full search for a scope", () => {
  it("opens the search page on the scope's chip", () => {
    expect(searchPageHref("q4 plan", "tasks")).toBe("/app/search?query=q4%20plan&in=tasks")
    expect(searchPageHref(" q4 ", null)).toBe("/app/search?query=q4")
    expect(searchPageHref("q4", "all")).toBe("/app/search?query=q4")
  })
})

describe("what a scope holds", () => {
  it("keeps the kinds its search page chip keeps", () => {
    expect(inScope("task", "tasks")).toBe(true)
    expect(inScope("doc", "tasks")).toBe(false)
    // A board rides with Docs, and a team with Channels, as on the search page.
    expect(inScope("board", "docs")).toBe(true)
    expect(inScope("team", "channels")).toBe(true)
    expect(inScope("user", "people")).toBe(true)
    // A direct message is a conversation, not a person.
    expect(inScope("chat", "people")).toBe(false)
  })

  it("holds everything with no scope", () => {
    expect(inScope("chat", null)).toBe(true)
    expect(inScope("task", undefined)).toBe(true)
    expect(inScope("task", "all")).toBe(true)
  })
})
