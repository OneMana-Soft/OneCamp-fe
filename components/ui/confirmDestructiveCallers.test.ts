import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

/**
 * Destructive confirms say one thing, in red.
 *
 * 1. A confirm that deletes, removes, revokes, leaves, discards or disconnects
 *    draws its button in red, and the dialog only knows that when the caller
 *    says so: `destructive: true`, whether it goes through useConfirm or opens
 *    the dialog directly with openUI({ key: "confirmAlert", data }). About
 *    twenty-five direct openers never said so, and "Delete post" asked in the
 *    brand's orange, the colour of the safe primary action.
 * 2. The button names what the title asks about. Its words after the verb
 *    ("Delete *doc*", "Remove *data source*") must all appear in the title.
 *    Openers had drifted into "Deleting Doc" over a "Delete chat" button and
 *    "Deleting comment" over "Delete post". A person reads the title, then
 *    clicks the button; if they disagree, one of them is wrong about what is
 *    about to be lost.
 *
 * It reads every confirmAlert data block and every object with a confirmText
 * in a file that uses useConfirm.
 */
const root = resolve(__dirname, "../..")
const DANGER = /\b(delet|remov|revok|leav|discard|disconnect)/i

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

/** The balanced `{ ... }` starting at `open`. */
function objectAt(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1)
  }
  return ""
}

/** The innermost object literal enclosing `at`. */
function enclosingObject(src: string, at: number): string {
  let depth = 0
  for (let i = at; i >= 0; i--) {
    if (src[i] === "}") depth++
    else if (src[i] === "{") {
      if (depth === 0) return objectAt(src, i)
      depth--
    }
  }
  return ""
}

function confirmBlocks(src: string): string[] {
  const blocks = new Set<string>()
  for (const m of src.matchAll(/key:\s*["']confirmAlert["']/g)) {
    const data = src.indexOf("data:", m.index!)
    if (data >= 0) blocks.add(objectAt(src, src.indexOf("{", data)))
  }
  if (/\buseConfirm\b/.test(src)) {
    for (const m of src.matchAll(/confirmText:/g)) blocks.add(enclosingObject(src, m.index!))
  }
  return [...blocks].filter(Boolean)
}

/** Every string literal in a field's value, up to the next field (a conditional title has two). */
function literals(block: string, field: string): string[] {
  const start = block.search(new RegExp(`\\b${field}:`))
  if (start < 0) return []
  const rest = block.slice(start + field.length + 1)
  const next = rest.search(/,\s*\n\s*(?:\/\/[^\n]*\n\s*)*\w+:/)
  const value = next >= 0 ? rest.slice(0, next) : rest
  return [...value.matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? m[3])
}

const words = (s: string) =>
  s.replace(/\$\{[^}]*\}/g, " ").toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean)

const blocks = ["components", "app"]
  .flatMap((d) => walk(resolve(root, d)))
  .flatMap((file) => confirmBlocks(readFileSync(file, "utf8")).map((block) => ({ file: relative(root, file), block })))

describe("destructive confirms", () => {
  it("finds the confirms it is meant to check", () => {
    expect(blocks.length).toBeGreaterThan(40)
  })

  it("marks every delete, remove, revoke, leave, discard or disconnect as destructive", () => {
    const offenders = blocks
      .filter(({ block }) => [...literals(block, "title"), ...literals(block, "confirmText")].some((w) => DANGER.test(w)))
      .filter(({ block }) => !/destructive:\s*true/.test(block))
      .map(({ file, block }) => `${file}: ${literals(block, "confirmText").join(" | ")}`)
    expect(offenders, `add destructive: true to:\n${offenders.join("\n")}`).toEqual([])
  })

  it("names in the title the thing its button acts on", () => {
    const offenders: string[] = []
    for (const { file, block } of blocks) {
      if (!/destructive:\s*true/.test(block)) continue
      const titles = literals(block, "title")
      for (const button of literals(block, "confirmText")) {
        const noun = words(button).slice(1)
        if (noun.length === 0) {
          offenders.push(`${file}: "${button}" names no thing (use "Delete doc", not "Delete")`)
          continue
        }
        for (const title of titles) {
          const have = new Set(words(title))
          const missing = noun.filter((w) => !have.has(w))
          if (missing.length) offenders.push(`${file}: "${button}" vs title "${title}" (missing: ${missing.join(", ")})`)
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([])
  })
})
