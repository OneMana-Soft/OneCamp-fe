import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// Switching the gallery's kind keeps the last grid until the next arrives, its
// skeleton is the cards' height, and an empty kind says which kind is empty.
const src = readFileSync("app/app/templates/page.tsx", "utf8")

describe("the templates gallery's kinds", () => {
  it("keeps the previous kind's grid while the next loads", () => {
    expect(src).toMatch(/keepPreviousData: true/)
    expect(src).toMatch(/firstLoad \? \(/)
  })
  it("sizes its skeleton cards to the real ones", () => {
    expect(src).toMatch(/cardClassName="min-h-\[10\.5rem\]/)
  })
  it("names the kind that is empty", () => {
    expect(src).toMatch(/No \$\{KIND_META\[kind\]\.label\.toLowerCase\(\)\} templates yet/)
  })
})
