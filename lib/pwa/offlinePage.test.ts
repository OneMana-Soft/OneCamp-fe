// @vitest-environment node
// public/offline.html can't use the app's stylesheet (the worker serves it, with no app CSS or JS, while nothing gets
// through), so it carries copies of the app's colour tokens. They stay equal to app/globals.css in light (:root) and
// dark (.dark), so a palette change can't leave the offline page behind (asana-12).
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8")
const PAGE = read("public/offline.html")
const APP = read("app/globals.css")

// The tokens the page copies, by its name and the app's. Its --glow is its own: the app's is an RGB triplet.
const COPIED: Record<string, string> = {
  frame: "frame",
  sheet: "sheet",
  ink: "ink",
  "ink-2": "ink-2",
  line: "line",
  brand: "brand",
  "brand-text": "brand-text",
  "on-brand": "brand-foreground",
}

/** The custom properties of the first rule whose selector is exactly `selector`, at the start of a line. */
function tokensOf(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const rule = new RegExp(`^[ \\t]*${escaped}[ \\t]*\\{([^}]*)\\}`, "m").exec(css)
  if (!rule) throw new Error(`no "${selector}" rule`)
  return Object.fromEntries([...rule[1].matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]))
}

describe("the offline page's colours", () => {
  it.each([
    ["light", ":root", ":root"],
    ["dark", ":root.dark", ".dark"],
  ])("equal the app's in %s", (_theme, pageRule, appRule) => {
    const app = tokensOf(APP, appRule)
    const page = tokensOf(PAGE, pageRule)
    for (const [mine, theirs] of Object.entries(COPIED)) {
      expect(app[theirs], `app/globals.css ${appRule} declares --${theirs}`).toBeTruthy()
      expect(page[mine], `offline.html ${pageRule} --${mine} is the app's --${theirs}`).toBe(app[theirs])
    }
  })
})
