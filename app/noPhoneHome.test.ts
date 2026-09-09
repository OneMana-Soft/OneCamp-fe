import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * A self-hosted install must not report anything to us.
 *
 * This is not a preference, it is most of why people buy OneCamp. The docs make
 * the claim in DataSovereignty terms, the backend has no call home in it, and the
 * CSP report endpoint was deliberately pointed at the customer's own server
 * rather than ours for exactly this reason.
 *
 * WHY IT NEEDS A GUARD NOW. The demo frontend and this one are separate repos
 * whose component trees are usually byte-identical, and porting work between them
 * is a routine `git cherry-pick`. The demo carries funnel instrumentation that
 * reports which screens a visitor reached to the marketing site's API. That code
 * is inert without an endpoint, so if it were ever picked over here it would
 * compile, pass every test, and look entirely harmless in review. The thing that
 * would go wrong is not a crash; it is a promise quietly stopping being true.
 *
 * So the shape is banned here rather than trusted to stay behind.
 */
const root = resolve(__dirname, "..")

const BANNED: { pattern: RegExp; why: string }[] = [
  {
    pattern: /NEXT_PUBLIC_FUNNEL_ENDPOINT/,
    why: "the demo's funnel endpoint. A self-hosted build must have nowhere to report to.",
  },
  {
    pattern: /\/onecamp\/track/,
    why: "the marketing site's analytics beacon. Nothing a customer runs may post to it.",
  },
  {
    pattern: /demoFunnel/,
    why: "the demo's funnel instrumentation, which belongs only in the demo repository.",
  },
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (["node_modules", ".next", ".git", "out", "dist"].includes(entry.name)) continue
      walk(full, out)
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe("a self-hosted build never phones home", () => {
  const files = [
    ...walk(resolve(root, "app")),
    ...walk(resolve(root, "components")),
    ...walk(resolve(root, "services")),
    ...walk(resolve(root, "lib")),
  ].filter((f) => !f.endsWith("noPhoneHome.test.ts"))

  it("scans a meaningful number of files", () => {
    expect(files.length, "the walk found almost nothing, so this guard enforces nothing").toBeGreaterThan(100)
  })

  for (const { pattern, why } of BANNED) {
    it(`carries no reference to ${pattern.source}`, () => {
      const offenders = files
        .filter((f) => pattern.test(readFileSync(f, "utf8")))
        .map((f) => f.slice(root.length + 1))

      expect(
        offenders,
        `${why}\nFound in:\n  ${offenders.join("\n  ")}\n\n` +
          "If this arrived by cherry-pick from the demo repository, drop it: that instrumentation " +
          "is the demo's and must not ship to anyone who self-hosts.",
      ).toEqual([])
    })
  }
})
