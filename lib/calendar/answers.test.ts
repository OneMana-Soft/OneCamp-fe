import { describe, expect, it } from "vitest"
import { answerCounts, answerOfMe, answerWordOf, countsLine, faceLabel, inAnswerOrder, outsiderName, responseOf } from "@/lib/calendar/answers"

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
    expect(faceLabel({ name: "Maya Chen", response: "accepted" })).toBe("Maya Chen, going")
    expect(faceLabel({ name: "Sam Rivera", organiser: true })).toBe("Sam Rivera, organiser")
    expect(faceLabel({ name: "Jo", response: "perhaps" })).toBe("Jo, no answer yet")
    expect(responseOf(undefined)).toBe("needs_action")
    expect(outsiderName({ email: "alex@example.org" })).toBe("alex@example.org")
    expect(outsiderName({ name: " Alex Kim ", email: "alex@example.org" })).toBe("Alex Kim")
  })

  // One word for a decline their out of office made, wherever a guest list says an answer (calendar head 5c, DB-25).
  it("says out of office for a decline the guest's out of office made, in the lists, on the face and in the counts", () => {
    const away = { name: "Ana Silva", response: "declined", away: true }
    expect(answerWordOf(away)).toBe("out of office")
    expect(faceLabel(away)).toBe("Ana Silva, out of office")
    expect(answerWordOf({ response: "declined" })).toBe("not going")
    expect(answerWordOf({ response: "declined", organiser: true })).toBe("organiser")
    expect(answerWordOf({})).toBe("no answer yet")
    const counted = answerCounts([...guests, { user_uuid: "f", name: "Fay", response: "declined", out_of_office: true }])
    expect(countsLine(counted)).toBe("2 going · 1 maybe · 1 not going · 1 out of office · 1 no answer")
    expect(answerCounts(guests).away).toBeUndefined()
  })

  it("says the answer itself once an away guest answers another way, in their word and the counts alike", () => {
    // Going? answered at once keeps the read's mark until the next read (sendAnswer's optimistic write).
    const going = { name: "Ana Silva", response: "accepted", away: true }
    expect(answerWordOf(going)).toBe("going")
    expect(faceLabel(going)).toBe("Ana Silva, going")
    expect(answerWordOf({ response: "tentative", away: true })).toBe("maybe")
    const counted = answerCounts([{ user_uuid: "a", name: "Ana Silva", response: "accepted", out_of_office: true }])
    expect(countsLine(counted)).toBe("1 going")
  })
})
