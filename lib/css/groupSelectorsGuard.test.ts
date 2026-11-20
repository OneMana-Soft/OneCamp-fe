// @vitest-environment node
// Guard (FLUIDITY-35 P3): the app's CSS holds no Tailwind group-* or peer-* selector in the shape
// `X:is(:where(.group)<state> *)` / `X:is(:where(.peer)<state> ~ *)`. Blink cannot narrow
// `:is(... *)`: a :hover or :focus-visible change on a .group row marks the row's whole subtree
// for restyle (29 elements on a task row, against the 3 that carry a group variant).
// lib/css/groupSelectors.mjs rewrites them to `:where(.group):hover X` after Tailwind runs.
// This test runs the Tailwind entries through postcss.config.mjs the way `next build` does, with and
// without the rewrite, and checks every changed selector against a derivation of its own.
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import postcss, { type AcceptedPlugin } from "postcss"
import { expect, it } from "vitest"
import config from "../../postcss.config.mjs"

const ROOT = path.resolve(__dirname, "../..")
const requireFromApp = createRequire(path.join(ROOT, "package.json"))

type Entry = string | AcceptedPlugin | [string | ((options: unknown) => AcceptedPlugin), unknown]

// Next's Turbopack PostCSS loader: string entries are required and called with their options,
// plugin objects are used as they are, and the object form maps names to options.
function loadPlugins(plugins: Entry[] | Record<string, unknown>): AcceptedPlugin[] {
  const entries: Entry[] = Array.isArray(plugins)
    ? plugins.map((p) => (typeof p === "string" ? [p, {}] : p))
    : Object.entries(plugins).filter(([, options]) => options) as Entry[]
  return entries.map((entry) => {
    if (!Array.isArray(entry)) return entry as AcceptedPlugin
    let factory = typeof entry[0] === "string" ? requireFromApp(entry[0]) : entry[0]
    if (factory.default) factory = factory.default
    return factory(entry[1])
  })
}

// Splits a selector list at its top-level commas.
function splitList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const ch = list[i]
    if (ch === "\\") i++
    else if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (ch === "," && depth === 0) {
      out.push(list.slice(start, i).trim())
      start = i + 1
    }
  }
  out.push(list.slice(start).trim())
  return out
}

// One compound (no top-level combinator) holding a group/peer `:is(:where(.group…) … *)`.
function isGroupShape(selector: string): boolean {
  let depth = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === "\\") i++
    else if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
    else if (depth === 0 && /[\s>+~]/.test(ch)) return false
  }
  return /:is\(:where\(\.(group|peer)[\\/)]/.test(selector) && /(\s|~\s?)\*\)/.test(selector)
}


// The rewrite worked out without the plugin's parser: the one depth-0 `:is(<inner> *)` / `:is(<inner> ~ *)`
// comes out and leads, `X:is(<inner> *)` -> `<inner> X`; null when there is not exactly one.
function derive(selector: string): string | null {
  const found: string[] = []
  for (let i = 0, depth = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === "\\") i++
    else if (depth === 0 && selector.startsWith(":is(", i)) {
      let j = i + 4
      for (let d = 1; d > 0 && j < selector.length; j++) d += selector[j] === "\\" ? (j++, 0) : selector[j] === "(" ? 1 : selector[j] === ")" ? -1 : 0
      const body = selector.slice(i + 4, j - 1).trimEnd()
      const head = body.slice(0, -1).trimEnd()
      const comb = head.endsWith("~") ? " ~ " : head !== body.slice(0, -1) && !/[>+]$/.test(head) ? " " : null
      const rest = selector.slice(0, i) + selector.slice(j)
      if (body.endsWith("*") && comb) found.push(`${(comb === " " ? head : head.slice(0, -1)).trim()}${comb}${rest || "*"}`)
      i = j - 1
    } else if (ch === "(" || ch === "[") depth++
    else if (ch === ")" || ch === "]") depth--
  }
  return found.length === 1 ? found[0] : null
}

// Next runs every CSS file through postcss.config.mjs; these two pull Tailwind in (`@import`, `@reference`).
const ENTRIES: [string, number][] = [
  ["app/globals.css", 100], // 162 group/peer selectors on LIVE when this guard was written
  ["components/minimal-tiptap/styles/index.css", 0],
]

async function compile(file: string, rewrite: boolean) {
  const from = path.join(ROOT, file)
  const saved = process.env.NODE_ENV
  let plugins: AcceptedPlugin[]
  try {
    // `next build` runs with NODE_ENV=production, which turns on Tailwind's optimise step.
    ;(process.env as Record<string, string>).NODE_ENV = "production"
    plugins = loadPlugins((config as { plugins: Entry[] | Record<string, unknown> }).plugins)
  } finally {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = saved
  }
  if (!rewrite) plugins = plugins.filter((p) => (p as { postcssPlugin?: string }).postcssPlugin !== "onecamp-group-selectors")
  return (await postcss(plugins).process(fs.readFileSync(from, "utf8"), { from })).root
}

it.each(ENTRIES)("%s: each rewrite is the :is() shape moved out, nothing else changes", async (file, least) => {
  const base = await compile(file, false)
  const built = await compile(file, true)
  const selectors = (root: typeof base) => {
    const out: string[] = []
    root.walkRules((rule) => {
      out.push(rule.selector)
      rule.selector = ""
    })
    return out
  }
  const [before, after] = [selectors(base), selectors(built)]
  // Rules pair by index: same rules, wrappers, order and declarations; only selectors may differ.
  expect(built.toString() === base.toString() && after.length === before.length).toBe(true)
  const wrong: string[] = []
  const left: string[] = []
  let rewritten = 0
  before.forEach((list, i) => {
    const [was, now] = [splitList(list), splitList(after[i])]
    if (now.length !== was.length) return wrong.push(`${list} -> ${after[i]}`)
    was.forEach((selector, k) => {
      if (now[k] === selector) return isGroupShape(selector) && left.push(selector)
      rewritten++
      if (now[k] !== derive(selector)) wrong.push(`${selector} -> ${now[k]} (want ${derive(selector)})`)
    })
  })
  expect({ wrong: wrong.slice(0, 5), left: left.slice(0, 5) }).toEqual({ wrong: [], left: [] })
  expect(rewritten).toBeGreaterThanOrEqual(least)
}, 180_000)
