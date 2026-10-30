import { describe, expect, it } from "vitest"
import { docAbilities, docLevelOf, levelLabel, levelSentence, maySuggestDecide, offersModes, type DocLevel } from "./abilities"

// Docs incident, 14 Oct 2026: one function says what a level allows, and
// every surface asks it. The server writes the level into a doc answer's
// counts from the Access Resolver, whatever the right came from.

const NEEDS = { summarize: "view", explain: "view", ask: "view", translate: "view", write: "edit", rewrite: "edit" }

describe("the level a doc answer carries", () => {
    it("is the highest count the server set", () => {
        expect(docLevelOf({ doc_read_access: 1, doc_comment_access: 1, doc_edit_access: 1, doc_full_access: 1 })).toBe("full")
        expect(docLevelOf({ doc_read_access: 1, doc_comment_access: 1, doc_edit_access: 1 })).toBe("edit")
        expect(docLevelOf({ doc_read_access: 1, doc_comment_access: 1 })).toBe("comment")
        expect(docLevelOf({ doc_read_access: 1 })).toBe("view")
        expect(docLevelOf({})).toBe("none")
        expect(docLevelOf(undefined)).toBe("none")
    })
})

describe("what a level allows", () => {
    const row = (l: DocLevel) => {
        const a = docAbilities(l, NEEDS)
        return [a.view, a.comment, a.edit, a.share, a.askRead, a.askWrite, a.canAsk("summarize"), a.canAsk("rewrite")]
    }
    it.each([
        ["none", [false, false, false, false, false, false, false, false]],
        ["view", [true, false, false, false, true, false, true, false]],
        ["comment", [true, true, false, false, true, false, true, false]],
        ["edit", [true, true, true, false, true, true, true, true]],
        ["full", [true, true, true, true, true, true, true, true]],
    ] as const)("%s", (level, want) => {
        expect(row(level)).toEqual(want)
    })

    it("asks the server's list for Ask AI: with none, every action needs edit", () => {
        expect(docAbilities("view", null).askRead).toBe(false)
        expect(docAbilities("view", null).canAsk("summarize")).toBe(false)
        expect(docAbilities("edit", null).canAsk("summarize")).toBe(true)
        // An action the server doesn't name needs edit.
        expect(docAbilities("view", NEEDS).canAsk("continue")).toBe(false)
    })

    it("is said, never left silent", () => {
        expect(levelSentence("view")).toBe("You can view this doc")
        expect(levelSentence("comment")).toBe("You can comment on this doc")
        expect(levelSentence("comment", true)).toBe("This doc is locked, so you can comment on it")
        expect(levelLabel("view")).toBe("View only")
        expect(levelLabel("comment")).toBe("Can comment")
        expect(levelLabel("edit")).toBe("")
        expect(levelLabel(undefined)).toBe("")
    })
})

describe("who decides suggestions", () => {
  it("lets editors decide, and under a hard lock only full access", () => {
    expect(maySuggestDecide("edit", "")).toBe(true)
    expect(maySuggestDecide("edit", "hard")).toBe(false)
    expect(maySuggestDecide("full", "hard")).toBe(true)
    expect(maySuggestDecide("comment", "")).toBe(false)
  })
})

// A reader who may comment suggests from the selection bar instead.
describe("Editing or Suggesting", () => {
  it("is offered to whoever may edit, and not under a hard lock", () => {
    expect(offersModes("edit", "")).toBe(true)
    expect(offersModes("full", "soft")).toBe(true)
    expect(offersModes("edit", "hard")).toBe(false)
    expect(offersModes("comment", "")).toBe(false)
    expect(offersModes("view", undefined)).toBe(false)
  })
})
