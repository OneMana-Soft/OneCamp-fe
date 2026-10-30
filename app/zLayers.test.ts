import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

/**
 * Every layer the app asks for by name, var(--z-…) in a stylesheet, a class
 * (z-[var(--z-…)]) or a style, is one that THE LAYERS in app/globals.css
 * define. A name nothing defines makes its declaration invalid where it is
 * used, so z-index falls back to auto and the layer drops under everything
 * positioned with a z of its own. On 23 Oct 2026 bfe9e9d65 folded
 * --z-modal-backdrop into --z-modal, and the page's scrim under a phone's
 * popover, menu or select sheet (app/overlay.css 8) kept asking for it: at
 * 390 the bars and a table's sticky header stayed bright over the scrim and
 * took the tap that should have closed the sheet (main, 26 Oct). A fallback,
 * as in var(--z-toast, 800), doesn't excuse a name: it hides the same slip.
 */
const root = resolve(__dirname, "..")
const DIRS = ["app", "components", "lib", "hooks"]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(css|tsx?)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/** A file's text without its comments: block comments anywhere, and whole-line // comments in a script. */
function code(file: string): string {
  const text = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  return file.endsWith(".css") ? text : text.replace(/^\s*\/\/.*$/gm, "")
}

const files = DIRS.flatMap((dir) => walk(resolve(root, dir)))
const defined = new Set(
  files.filter((f) => f.endsWith(".css")).flatMap((f) => [...code(f).matchAll(/(--z-[a-z0-9-]+)\s*:/g)].map((m) => m[1])),
)
const asked = files.flatMap((f) => [...code(f).matchAll(/var\(\s*(--z-[a-z0-9-]+)/g)].map((m) => ({ file: relative(root, f), name: m[1] })))

describe("the layers (app/globals.css, THE LAYERS)", () => {
  it("are read from the stylesheets, and the names asked for from the app's code", () => {
    expect([...defined]).toEqual(expect.arrayContaining(["--z-base", "--z-sticky", "--z-fixed", "--z-corner", "--z-modal", "--z-popover", "--z-dropdown", "--z-tooltip", "--z-toast"]))
    expect(asked.length, "the layers asked for by name in app, components, lib and hooks").toBeGreaterThan(40)
  })

  it("define every layer asked for by name: one they lack falls to z-index: auto", () => {
    expect(asked.filter((a) => !defined.has(a.name)).map((a) => `${a.file}: ${a.name}`)).toEqual([])
  })
})
