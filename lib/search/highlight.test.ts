import { describe, expect, it } from "vitest"
import { fragmentEdges, highlightRuns, highlightText } from "@/lib/search/highlight"

/**
 * Fragments are what the search server sends back (see the demo's answers on
 * 10 Oct 2026). Each case is one that rendered wrong: entities shown as
 * "&#39;", an entity broken by the highlighter, tags shown as text, and an
 * ellipsis on both ends of a whole sentence.
 */
describe("highlightRuns", () => {
  it("splits a fragment into what matched and what didn't", () => {
    expect(highlightRuns("Write the <mark>launch</mark> announcement")).toEqual([
      { text: "Write the ", hit: false },
      { text: "launch", hit: true },
      { text: " announcement", hit: false },
    ])
  })

  it("decodes entities, even one the highlighter split", () => {
    // The real answer for "39": the match is inside the apostrophe's entity.
    const runs = highlightRuns("Answer in this thread; everyone&#<mark>39</mark>;s answers are together here.")
    expect(runs.map((r) => r.text).join("")).toBe("Answer in this thread; everyone's answers are together here.")
    // Matching an entity's digits is not a match on the apostrophe.
    expect(runs.some((r) => r.hit)).toBe(false)
  })

  it("decodes named entities inside and outside a match", () => {
    expect(highlightText("Tom &amp; <mark>Jerry&#39;s</mark> Q&amp;A")).toBe("Tom & Jerry's Q&A")
    expect(highlightRuns("<mark>R&amp;D</mark> budget")[0]).toEqual({ text: "R&D", hit: true })
  })

  it("never passes markup through: other tags go, a break becomes a space", () => {
    expect(highlightText('today?<p>Check-in</p><script>alert(1)</script><img src=x onerror="x()">')).toBe("today? Check-in alert(1)")
    expect(highlightText("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>")
  })

  it("accepts <em> from older answers and joins neighbouring matches", () => {
    expect(highlightRuns("<em>Q4</em> <em>launch</em> plan")).toEqual([
      { text: "Q4 launch", hit: true },
      { text: " plan", hit: false },
    ])
  })

  it("collapses whitespace and trims", () => {
    expect(highlightText("  two\n\n spaces   here ")).toBe("two spaces here")
  })

  it("is empty for nothing", () => {
    expect(highlightRuns(undefined)).toEqual([])
    expect(highlightRuns("")).toEqual([])
  })
})

describe("fragmentEdges", () => {
  const post = "Release candidate for the Q4 launch is up on staging. Everything on the checklist in the Q4 launch plan is green except the load test."

  it("puts no ellipsis on a fragment that is the whole text", () => {
    expect(fragmentEdges("Does the pricing table still fit on one screen on a phone?", "Does the pricing table still fit on one screen on a phone?")).toEqual({ before: false, after: false })
  })

  it("marks only the side that was cut, against the whole text", () => {
    expect(fragmentEdges("Release candidate for the Q4 launch is up on staging.", post)).toEqual({ before: false, after: true })
    expect(fragmentEdges("Everything on the checklist in the Q4 launch plan is green except the load test.", post)).toEqual({ before: true, after: false })
  })

  it("compares against stored text with its entities", () => {
    expect(fragmentEdges("everyone's answers are together here.", "Answer in this thread; everyone&#39;s answers are together here.")).toEqual({ before: true, after: false })
  })

  it("judges by shape when the whole text isn't sent (a doc's body)", () => {
    expect(fragmentEdges("We launch on the last Tuesday of the month.")).toEqual({ before: false, after: false })
    expect(fragmentEdges("onboarding: Maya Walkthrough and checklist: Jonas Risks The pilot's SAML certificate expires the week before launch")).toEqual({ before: true, after: true })
  })
})
