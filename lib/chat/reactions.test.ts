import { describe, expect, it } from "vitest"
import { chooseReaction, groupReactions, MAX_DISTINCT_REACTIONS, MAX_REACTIONS_PER_PERSON, namesByEmoji, reactedWith } from "./reactions"
import type { GroupedReaction } from "@/types/reaction"

// Reactions like Slack's (chat B25, D-M7): several emoji a person, each
// once. The rule every row used was one reaction a person, found and
// replaced, so a second emoji took the first one's place.

const ME = "me-uuid"
const r = (uid: string, emoji: string, who: string, name = who): GroupedReaction =>
  ({ uid, reaction_emoji_id: emoji, reaction_added_by: { user_uuid: who, user_name: name }, reaction_added_at: "", reaction_on_content_added_by: {} }) as unknown as GroupedReaction
const nameOf = (x: GroupedReaction) => x.reaction_added_by?.user_name ?? ""

describe("a message's reactions", () => {
  it("group by emoji in the order each first came, each person once, and know which are mine", () => {
    const groups = groupReactions([r("1", "+1", "maya"), r("2", "tada", ME, "me"), r("3", "+1", ME, "me"), r("4", "+1", "maya"), r("5", "", "jonas")], ME, nameOf)
    expect([...groups.keys()]).toEqual(["+1", "tada"])
    expect(groups.get("+1")).toEqual({ names: ["maya", "me"], mine: ["3"] })
    expect(groups.get("tada")).toEqual({ names: ["me"], mine: ["2"] })
    expect(namesByEmoji(groups)).toEqual({ "+1": ["maya", "me"], tada: ["me"] })
    expect([...reactedWith(groups)].sort()).toEqual(["+1", "tada"])
  })

  it("count a person who holds an emoji twice (an add from before) once, and keep both of their nodes", () => {
    const groups = groupReactions([r("1", "+1", ME, "me"), r("2", "+1", ME, "me")], ME, nameOf)
    expect(groups.get("+1")).toEqual({ names: ["me"], mine: ["1", "2"] })
  })
})

describe("a click on an emoji", () => {
  it("adds a second emoji as a reaction of its own, and only the first is my first", () => {
    const none = groupReactions([r("1", "+1", "maya")], ME, nameOf)
    expect(chooseReaction(none, "+1")).toEqual({ kind: "add", first: true })
    const one = groupReactions([r("1", "+1", ME)], ME, nameOf)
    // The old rule replaced the 👍: a 🎉 is added beside it.
    expect(chooseReaction(one, "tada")).toEqual({ kind: "add", first: false })
  })

  it("takes back the reader's own, by one of its nodes", () => {
    const groups = groupReactions([r("1", "+1", ME), r("2", "+1", ME), r("3", "+1", "maya")], ME, nameOf)
    expect(chooseReaction(groups, "+1")).toEqual({ kind: "remove", reactionId: "1" })
  })

  it("says so at the caps: 23 emoji a person, 50 different on a message", () => {
    const mine = Array.from({ length: MAX_REACTIONS_PER_PERSON }, (_, i) => r(`m${i}`, `e${i}`, ME))
    const full = groupReactions(mine, ME, nameOf)
    expect(chooseReaction(full, "rocket")).toMatchObject({ kind: "refuse", description: "You can add up to 23 reactions to one message." })
    // One she has can still be taken back.
    expect(chooseReaction(full, "e3")).toEqual({ kind: "remove", reactionId: "m3" })

    const many = groupReactions(Array.from({ length: MAX_DISTINCT_REACTIONS }, (_, i) => r(`o${i}`, `e${i}`, `p${i}`)), ME, nameOf)
    expect(chooseReaction(many, "rocket")).toMatchObject({ kind: "refuse", description: "It already has 50 different reactions. Add one of those instead." })
    expect(chooseReaction(many, "e7")).toEqual({ kind: "add", first: true })
  })
})
