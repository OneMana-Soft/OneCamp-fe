import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

/**
 * No `prose` classes while the typography plugin is off.
 *
 * Tailwind v4 reads its configuration from CSS: tailwind.config.ts is ignored
 * unless globals.css names it with @config, and a plugin loads only through
 * @plugin. globals.css does neither, so @tailwindcss/typography never runs and
 * `prose`, `prose-sm`, `dark:prose-invert`, `not-prose` and the rest generate
 * nothing. Twelve files carried them, each looking styled in review and doing
 * nothing on screen. Keeping the plugin off is the owner's decision (10 Oct
 * 2026): rich text is styled by the editor's own sheet. If the plugin is ever
 * loaded with @plugin "@tailwindcss/typography", this guard steps aside.
 *
 * `max-w-prose` is core Tailwind (65ch), not the plugin's, and stays allowed.
 */

const ROOT = resolve(__dirname, "..")
const DIRS = ["app", "components", "lib", "hooks", "context", "store", "services"]

function files(dir: string, out: string[] = []): string[] {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (["node_modules", ".next"].includes(e.name)) continue
      files(full, out)
    } else if (/\.(tsx?|jsx?|css)$/.test(e.name) && !/\.test\.(tsx?|ts)$/.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

/** A class token from the plugin, with any variants: prose, prose-sm, dark:prose-invert, sm:prose-base, not-prose. */
const PLUGIN_CLASS = /^!?(?:not-)?prose(?:-[a-z0-9]+)?!?$/

/** Plugin classes in a source file's string literals (or a stylesheet's @apply), comments ignored. */
function proseClasses(src: string, css = false): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1")
  const texts = css
    ? [...code.matchAll(/@apply\s+([^;]+);/g)].map((m) => m[1])
    : [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? "")
  const found: string[] = []
  for (const text of texts) {
    for (const token of text.split(/\s+/)) {
      const utility = token.split(":").pop() ?? ""
      if (PLUGIN_CLASS.test(utility)) found.push(token)
    }
  }
  return found
}

const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8")
const pluginLoaded = /@plugin\s+["']@tailwindcss\/typography["']/.test(globals)

describe("prose classes", () => {
  it.skipIf(pluginLoaded)("are not used while the typography plugin is off", () => {
    const offenders: string[] = []
    for (const file of DIRS.flatMap((d) => files(join(ROOT, d)))) {
      const hits = proseClasses(readFileSync(file, "utf8"), file.endsWith(".css"))
      if (hits.length) offenders.push(`${relative(ROOT, file)}: ${hits.join(" ")}`)
    }
    expect(
      offenders,
      "These classes come from @tailwindcss/typography, which globals.css does not load, so they do nothing. " +
        "Style the text with core utilities, or load the plugin with @plugin in globals.css.",
    ).toEqual([])
  })

  it("would catch one, and leaves core max-w-prose and the word in comments alone", () => {
    expect(proseClasses(`<div className="prose prose-sm dark:prose-invert max-w-none" />`)).toEqual(["prose", "prose-sm", "dark:prose-invert"])
    expect(proseClasses(`cn("outline-none", "sm:prose-base")`)).toEqual(["sm:prose-base"])
    expect(proseClasses("<div className={`not-prose ${x}`} />")).toEqual(["not-prose"])
    expect(proseClasses(`.x { @apply prose-lg; }`, true)).toEqual(["prose-lg"])
    expect(proseClasses(`<p className="max-w-prose text-sm" />`)).toEqual([])
    expect(proseClasses(`// the model returns prose\n/* then prose, then a block */ const a = 1`)).toEqual([])
    expect(proseClasses(`const proseMirrorEl = view.dom`)).toEqual([])
  })
})
