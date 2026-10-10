import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * The playful showcase is for the people building the app. It must never
 * ship to a customer, and the public export carries every file here, so it
 * may import nothing only the AI edition or the demo has.
 */
const DIR = __dirname
const page = readFileSync(join(DIR, "page.tsx"), "utf8")

describe("the playful showcase", () => {
  it("is a 404 in any production build", () => {
    expect(page).toMatch(/if \(process\.env\.NODE_ENV === "production"\) notFound\(\)/)
    expect(page).toMatch(/import \{ notFound \} from "next\/navigation"/)
  })

  it("asks search engines to stay away", () => {
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/)
  })

  it.each(readdirSync(DIR).filter((f) => /\.tsx?$/.test(f) && !f.includes(".test.")))(
    "%s imports nothing AI-only or demo-only",
    (file) => {
      const src = readFileSync(join(DIR, file), "utf8")
      const imports = [...src.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1])
      const bad = imports.filter((s) => /@\/components\/ai\b|@\/lib\/ai\b|demo(Funnel|Destination|Splash|Guide|Wins)|Demo(Guide|LeadPrompt)/.test(s))
      expect(bad).toEqual([])
    },
  )
})
