import { describe, expect, it } from "vitest"
import { chatPath } from "./conversationRoute"

const MAYA = "11111111-1111-4111-8111-111111111111"
const JONAS = "22222222-2222-4222-8222-222222222222"
const GROUP = "0123456789abcdef0123456789abcdef"
const DM = `${JONAS} ${MAYA}`

// The same cases as the server's helpers.ChatPath, answered the same way.
describe("chatPath", () => {
  it("opens a DM at the other person, from either side", () => {
    expect(chatPath(DM, MAYA)).toBe(`/app/chat/${JONAS}`)
    expect(chatPath(DM, JONAS)).toBe(`/app/chat/${MAYA}`)
  })

  it("opens a message in a DM with its thread", () => {
    expect(chatPath(DM, MAYA, "m1")).toBe(`/app/chat/${JONAS}/m1`)
  })

  it("opens a group at its grouping id, and a message in it", () => {
    expect(chatPath(GROUP, MAYA)).toBe(`/app/chat/group/${GROUP}`)
    expect(chatPath(GROUP, JONAS, "m1")).toBe(`/app/chat/group/${GROUP}/m1`)
  })

  it("opens a DM with oneself at oneself", () => {
    expect(chatPath(`${MAYA} ${MAYA}`, MAYA)).toBe(`/app/chat/${MAYA}`)
  })

  it("builds nothing it would have to guess", () => {
    expect(chatPath("", MAYA, "m1")).toBeNull()
    expect(chatPath(undefined, MAYA)).toBeNull()
    // Who is signed in isn't known yet: either half could be the other person.
    expect(chatPath(DM, undefined, "m1")).toBeNull()
    // A group needs no one's id.
    expect(chatPath(GROUP, undefined, "m1")).toBe(`/app/chat/group/${GROUP}/m1`)
  })
})
