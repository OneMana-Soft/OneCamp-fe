import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// content.md D16, built on anchored threads (B7): a doc's comments are thread
// cards on --sunken, r12, each comment naming its author, and every composer
// floats on a raised card.
const card = readFileSync("components/docComments/ThreadCard.tsx", "utf8")
const composer = readFileSync("components/docComments/CommentComposer.tsx", "utf8")
const panel = readFileSync("components/rightPanel/docCommentList.tsx", "utf8")
const phone = readFileSync("components/rightPanel/docMobileCommentList.tsx", "utf8")

describe("a doc's comments", () => {
  it("are sunken r12 thread cards, each comment with its author", () => {
    expect(card).toMatch(/rounded-xl bg-sunken/)
    // A card's rows never fold into the one above: cards are read one by one.
    const desktopRow = card.slice(card.indexOf("<MessageContent"), card.indexOf("/>", card.indexOf("<MessageContent")))
    expect(desktopRow).not.toMatch(/continued=/)
    expect(panel).toMatch(/<ThreadCard\b/)
  })

  it("float every composer on a raised card, not a bordered muted box", () => {
    expect(composer).toMatch(/composer-card rounded-xl bg-raised/)
    expect(composer).not.toMatch(/bg-muted\/30/)
    for (const surface of [panel, phone]) expect(surface).toMatch(/<CommentComposer\b/)
  })

  it("say how to start one when there are none", () => {
    expect(panel).toMatch(/choose Comment/)
    expect(phone).toMatch(/tap Comment/)
  })
})
