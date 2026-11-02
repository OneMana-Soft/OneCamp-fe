import { describe, expect, it } from "vitest"
import { REACTIONS, isReaction } from "./set"
import { REACTION_NAMES } from "./names"
import { CALL_SIGNAL_TOPIC, encodeSignal, readReaction } from "@/lib/calls/signals"

describe("the one set of reactions a board and a call share (miro-24, Call Signals #53)", () => {
  it("is six, in the tray's order, each with the name its button and a screen reader say", () => {
    expect(REACTIONS).toEqual(["👍", "❤️", "😂", "🎉", "👏", "😮"])
    expect(REACTIONS.map((r) => REACTION_NAMES[r])).toEqual(["Thumbs up", "Heart", "Laughing", "Celebrate", "Clapping", "Surprised"])
  })

  it("is the very set a call reads, so a board in a call and the call can't drift apart", () => {
    const read = (emoji: string) => readReaction(encodeSignal("reaction", { emoji }), { identity: "maya" }, CALL_SIGNAL_TOPIC)?.emoji ?? null
    expect(REACTIONS.map(read)).toEqual([...REACTIONS])
    expect(read("🔥")).toBeNull()
  })

  it("takes only an emoji it offers: nothing else ever reaches anyone's screen", () => {
    for (const r of REACTIONS) expect(isReaction(r)).toBe(true)
    for (const v of ["🙂", "", "👍👍", " 👍", "<b>hi</b>", "constructor", 1, null, undefined, {}, ["👍"]]) expect(isReaction(v)).toBe(false)
  })
})
