import { describe, expect, it } from "vitest"
import { isTaskKey } from "./keysApi"

// The task page takes /app/task/Q4-12 as well as an id, reading a key as the
// server's Parse does (business/TaskKeys keys.go).
describe("a task's key in a link", () => {
  it("is two to five letters and digits starting with a letter, a dash and a number", () => {
    for (const k of ["Q4-12", "q4-12", "WEB-1", "A1B2C-999999999", " Q4-1 "]) expect(isTaskKey(k), k).toBe(true)
    for (const k of ["Q4", "Q4-", "Q4-0", "Q4-012", "LAUNCH-1", "4Q-1", "a2573bba-d50b-44a2-b9f0-94df8d7310a7", "Q4-1234567890"]) expect(isTaskKey(k), k).toBe(false)
  })
})
