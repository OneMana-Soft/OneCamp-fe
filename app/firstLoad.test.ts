import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import path from "path"

// What a visitor's first screen downloads. A new visitor waited 8 to 9
// seconds for Home, a good part of it on code Home never runs: the editor
// (ProseMirror, Yjs, code highlighting) came in through the thread panel in
// the app's layout, and the MQTT client through the realtime provider. They
// load when they're needed now. This walks the static imports from the
// layouts and Home (a dynamic import() starts a chunk of its own, so it isn't
// followed) and fails, naming the chain, if one of them is reached again.

const HEAVY = ["@tiptap/", "prosemirror-", "yjs", "y-prosemirror", "lowlight", "highlight.js", "mqtt", "framer-motion", "livekit-client", "@livekit/"]
const ENTRIES = ["app/layout.tsx", "app/app/layout.tsx", "app/app/home/page.tsx"]

const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && !c.endsWith("/") && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

function heavyReach(entries: string[]): string[] {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]))
  const queue = [...entries]
  const found: string[] = []
  const chain = (f: string | null): string => {
    const out: string[] = []
    while (f) {
      out.push(f)
      f = parent.get(f) ?? null
    }
    return out.join(" <- ")
  }
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const spec = m[1]
      const lib = HEAVY.find((h) => spec === h.replace(/\/$/, "") || spec.startsWith(h))
      if (lib) found.push(`${spec}: ${chain(file)}`)
      const next = resolve(spec, file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return found
}

describe("a visitor's first screen", () => {
  it("doesn't download the editor, the realtime client or an animation library", () => {
    expect(heavyReach(ENTRIES)).toEqual([])
  })

  it("would see one: the composer, walked from, brings the editor", () => {
    expect(heavyReach(["components/textInput/textInput.tsx"]).some((r) => r.startsWith("@tiptap/"))).toBe(true)
  })
})
