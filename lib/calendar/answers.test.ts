import { describe, expect, it } from "vitest"
import { answerCounts, answerOfMe, countsLine, faceLabel, inAnswerOrder, outsiderName, responseOf } from "@/lib/calendar/answers"

const guests = [
  { user_uuid: "a", name: "Ana", response: "needs_action" },
  { user_uuid: "b", name: "Ben", response: "declined" },
  { user_uuid: "c", name: "Cy", response: "accepted" },
  { email: "dee@example.org", response: "tentative" },
  { user_uuid: "e", name: "Eve", response: "accepted" },
]

describe("guests' answers", () => {
  it("counts each answer, the organiser among the going", () => {
    expect(countsLine(answerCounts(guests, true))).toBe("3 going · 1 maybe · 1 not going · 1 no answer")
    expect(countsLine(answerCounts(guests))).toBe("2 going · 1 maybe · 1 not going · 1 no answer")
    expect(countsLine(answerCounts([]))).toBe("")
  })

  it("orders the going, then maybe, not going and no answer, as added within each", () => {
    expect(inAnswerOrder(guests).map((g) => g.name ?? g.email)).toEqual(["Cy", "Eve", "dee@example.org", "Ben", "Ana"])
  })

  it("finds the reader's own answer, and nothing for someone not on it", () => {
    expect(answerOfMe(guests, "b")?.response).toBe("declined")
    expect(answerOfMe(guests, "z")).toBeUndefined()
    expect(answerOfMe(guests, undefined)).toBeUndefined()
  })

  it("names a face by its answer, and reads anything unknown as no answer yet", () => {
    expect(faceLabel("Maya Chen", "accepted")).toBe("Maya Chen, going")
    expect(faceLabel("Sam Rivera", undefined, true)).toBe("Sam Rivera, organiser")
    expect(faceLabel("Jo", "perhaps")).toBe("Jo, no answer yet")
    expect(responseOf(undefined)).toBe("needs_action")
    expect(outsiderName({ email: "alex@example.org" })).toBe("alex@example.org")
    expect(outsiderName({ name: " Alex Kim ", email: "alex@example.org" })).toBe("Alex Kim")
  })
})
