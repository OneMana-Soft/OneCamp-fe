import { describe, expect, it } from "vitest"

import { pinTestClock } from "@/lib/testing/testClock"
import { clockWords, deliveryStateWords, stepWords } from "./whyWords"

pinTestClock()

// A4 H4 (decision 8): a push that waits while its person is in OneCamp has
// its own words in Why: the step "wait" (verdict "in_onecamp"), the state
// "waiting", and a push the wait then dropped. "In OneCamp", never "at your desk".
describe("why words for a push that waits while you're in OneCamp", () => {
  const till = "2026-11-11T06:32:00Z"

  it("words the wait step with when it ends", () => {
    expect(stepWords({ step: "wait", verdict: "in_onecamp" }, "#launch", till)).toEqual({
      words: `You were in OneCamp, so your push waited until ${clockWords(till)}.`,
      tone: "held",
    })
    expect(stepWords({ step: "wait", verdict: "in_onecamp" }, "#launch")).toEqual({
      words: "You were in OneCamp, so your push waited.",
      tone: "held",
    })
  })

  it("words a waiting push", () => {
    expect(deliveryStateWords({ delivery: "push", state: "waiting", hold_until: till, at: till })).toEqual({
      words: `Waiting until ${clockWords(till)}, while you're in OneCamp`,
      tone: "held",
    })
  })

  it("words a push the wait dropped apart from one a hold dropped", () => {
    expect(deliveryStateWords({ delivery: "push", state: "dropped", at: till }, true)).toEqual({
      words: "Not sent: you read it first, or it was deleted or held",
      tone: "off",
    })
    expect(deliveryStateWords({ delivery: "push", state: "dropped", at: till })).toEqual({
      words: "Not sent: the message was deleted while it was held",
      tone: "off",
    })
  })

  it("never says desk", () => {
    const all = [
      stepWords({ step: "wait", verdict: "in_onecamp" }, "#launch", till).words,
      deliveryStateWords({ delivery: "push", state: "waiting", hold_until: till, at: till }).words,
      deliveryStateWords({ delivery: "push", state: "dropped", at: till }, true).words,
    ]
    for (const w of all) expect(w.toLowerCase()).not.toContain("desk")
  })
})
