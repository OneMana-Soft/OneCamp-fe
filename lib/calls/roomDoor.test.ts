import { describe, expect, it } from "vitest"
import { roomDoorPath } from "./roomDoor"

describe("roomDoorPath", () => {
  it("is a room's one door in the app, its name written safely in the path", () => {
    expect(roomDoorPath("design-review-k3x9p2qa")).toBe("/app/meet/join/r/design-review-k3x9p2qa")
    expect(roomDoorPath("a b/c?d")).toBe("/app/meet/join/r/a%20b%2Fc%3Fd")
  })
})
