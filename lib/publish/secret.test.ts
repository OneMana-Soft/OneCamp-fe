import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { SECRET_HINT, SECRET_LENGTH, secretProblem } from "./secret"

describe("a new password or passcode", () => {
  it("is 6 to 128 characters, said in the server's words", () => {
    expect(secretProblem("passcode", "12345")).toBe("A passcode is 6 to 128 characters.")
    expect(secretProblem("passcode", "123456")).toBe("")
    expect(secretProblem("password", "x".repeat(128))).toBe("")
    expect(secretProblem("password", "x".repeat(129))).toBe("A password is 6 to 128 characters.")
    expect(SECRET_HINT).toBe("At least 6 characters")
  })

  it("counts characters as the server does, not UTF-16 units", () => {
    expect(secretProblem("passcode", "🔑".repeat(5))).toBe("A passcode is 6 to 128 characters.")
    expect(secretProblem("passcode", "🔑".repeat(6))).toBe("")
  })

  // The rule is the server's (business/Guest/publish.go). Pointed at a backend
  // checkout (ONECAMP_BACKEND_DIR, as when gating a release), the numbers and
  // the words must be its own.
  const go = process.env.ONECAMP_BACKEND_DIR && path.join(process.env.ONECAMP_BACKEND_DIR, "business", "Guest", "publish.go")
  it.skipIf(!go || !existsSync(go))("is the server's rule, number for number and word for word", () => {
    const src = readFileSync(go!, "utf8")
    expect(Number(/\bshortestSecret\s*=\s*(\d+)/.exec(src)?.[1])).toBe(SECRET_LENGTH.shortest)
    expect(Number(/\blongestSecret\s*=\s*(\d+)/.exec(src)?.[1])).toBe(SECRET_LENGTH.longest)
    expect(src).toContain('"A %s is %d to %d characters."')
  })
})
