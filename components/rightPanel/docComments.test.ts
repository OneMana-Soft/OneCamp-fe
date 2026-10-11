import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// content.md D16 (the panel's look; anchoring waits for the backend): a doc's
// comments are cards on --sunken, r12, each naming its author, with the
// composer floating on a raised card.
const list = readFileSync("components/rightPanel/commentsList.tsx", "utf8")
const panel = readFileSync("components/rightPanel/docCommentList.tsx", "utf8")

describe("a doc's comments", () => {
  it("are sunken r12 cards, each with its author", () => {
    expect(list).toMatch(/data-comment-card="" className="[^"]*rounded-xl bg-sunken/)
    expect(list).toMatch(/continued=\{variant === "cards" \? false : continued\[idx\]\}/)
    expect(panel).toMatch(/variant="cards"/)
  })

  it("float the composer on a raised card, not a bordered muted box", () => {
    expect(panel).toMatch(/rounded-xl bg-raised p-2 shadow-e2/)
    expect(panel).not.toMatch(/bg-muted\/30/)
  })

  it("say how to start one when there are none", () => {
    expect(panel).toMatch(/choose Comment/)
  })
})
