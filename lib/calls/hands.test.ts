import { describe, expect, it } from "vitest"
import { FEEDBACK_ATTRIBUTE, HAND_ATTRIBUTE, LOWER_AFTER_SPEAKING_MS, feedbackLabel, feedbackOf, handAnnouncement, handOf, handQueue, placeIn, speakingLowersHand } from "./hands"
import { callActions, partOf, personActions } from "./control"

describe("raised hands", () => {
  it("are read from the server's attribute, and nothing else is a hand", () => {
    expect(handOf({ [HAND_ATTRIBUTE]: "1760900000123" })).toBe(1760900000123)
    expect(handOf({ [HAND_ATTRIBUTE]: "" })).toBeNull()
    expect(handOf({ [HAND_ATTRIBUTE]: "soon" })).toBeNull()
    expect(handOf(undefined)).toBeNull()
  })

  it("queue in the order they went up, the same on every screen", () => {
    const queue = handQueue([
      { identity: "jo", attributes: { [HAND_ATTRIBUTE]: "300" } },
      { identity: "ana", attributes: { [HAND_ATTRIBUTE]: "100" } },
      { identity: "sam" },
      { identity: "lee", attributes: { [HAND_ATTRIBUTE]: "300" } },
    ])
    expect(queue).toEqual(["ana", "jo", "lee"])
    expect(placeIn(queue, "ana")).toBe(1)
    expect(placeIn(queue, "lee")).toBe(3)
    expect(placeIn(queue, "sam")).toBeNull()
  })

  it("lower themselves after their owner has spoken for three seconds since raising", () => {
    expect(LOWER_AFTER_SPEAKING_MS).toBe(3000)
    expect(speakingLowersHand(1000, 2000, 4999)).toBe(false)
    expect(speakingLowersHand(1000, 2000, 5000)).toBe(true)
    // Speaking that began before the hand went up counts from the raise.
    expect(speakingLowersHand(5000, 1000, 7000)).toBe(false)
    expect(speakingLowersHand(5000, 1000, 8000)).toBe(true)
    expect(speakingLowersHand(null, 1000, 9000)).toBe(false)
    expect(speakingLowersHand(1000, null, 9000)).toBe(false)
  })

  it("are announced once, with a place in line after the first", () => {
    expect(handAnnouncement("Ana", true, 1, false)).toBe("Ana raised their hand")
    expect(handAnnouncement("Jo", true, 2, false)).toBe("Jo raised their hand, 2nd in line")
    expect(handAnnouncement("Lee", true, 13, false)).toBe("Lee raised their hand, 13th in line")
    expect(handAnnouncement("Ana", false, null, false)).toBe("Ana lowered their hand")
    // Your own says you, with your place.
    expect(handAnnouncement("Sam", true, 3, true)).toBe("You raised your hand, 3rd in line")
    expect(handAnnouncement("Sam", false, null, true)).toBe("You lowered your hand")
  })
})

describe("feedback", () => {
  it("is only what the server names", () => {
    expect(feedbackOf({ [FEEDBACK_ATTRIBUTE]: "slow_down" })).toBe("slow_down")
    expect(feedbackOf({ [FEEDBACK_ATTRIBUTE]: "shout" })).toBeNull()
    expect(feedbackLabel("slow_down")).toBe("Slow down")
    expect(feedbackLabel("away")).toBe("Away")
  })
})

describe("who lowers hands", () => {
  const target = { identity: "jo", role: "participant" as const, guest: false, micOn: false, cameraOn: false, sharing: false }
  it("is whoever the server gave lower_hands: a raised hand gets Lower hand, the panel Lower all hands", () => {
    const host = { ...partOf({ "oc.role": "host", "oc.can": "mute,lower_hands" }), identity: "sam" }
    expect(personActions(host, { ...target, handUp: true }).map((a) => a.action)).toContain("lower_hand")
    expect(personActions(host, target).map((a) => a.action)).not.toContain("lower_hand")
    expect(callActions(host, { locked: false, muteOnEntry: false, hands: 2 }).map((a) => a.action)).toContain("lower_all_hands")
    expect(callActions(host, { locked: false, muteOnEntry: false, hands: 0 }).map((a) => a.action)).not.toContain("lower_all_hands")
  })
  it("is nobody else", () => {
    const participant = { ...partOf({ "oc.role": "participant", "oc.can": "" }), identity: "ana" }
    expect(personActions(participant, { ...target, handUp: true }).map((a) => a.action)).not.toContain("lower_hand")
    expect(callActions(participant, { locked: false, muteOnEntry: false, hands: 3 })).toEqual([])
  })
})
