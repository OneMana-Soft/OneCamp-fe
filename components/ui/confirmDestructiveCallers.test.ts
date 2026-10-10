import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { relative, resolve } from "node:path"

/**
 * A confirm that deletes, removes, revokes or leaves draws its button in red,
 * and the dialog only knows that when the caller says so. useConfirm takes
 * `destructive`; code that opens the dialog directly with
 * openUI({ key: "confirmAlert", data }) has to put `destructive: true` in the
 * data itself. About twenty-two of those call sites never did, so "Delete
 * post" and "Remove member" asked in the brand's orange, the colour of the
 * safe, primary action.
 *
 * This reads every direct opener's data block and fails on one whose title or
 * confirm text says delete, remove, revoke or leave without the flag.
 */
const root = resolve(__dirname, "../..")
const DANGER = /\b(delet|remov|revok|leav)/i

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

/** The `data: { ... }` object that follows each `key: "confirmAlert"`, braces balanced. */
function confirmAlertBlocks(src: string): string[] {
  const blocks: string[] = []
  const re = /key:\s*["']confirmAlert["']/g
  for (const m of src.matchAll(re)) {
    const start = src.indexOf("data:", m.index!)
    if (start < 0) continue
    const open = src.indexOf("{", start)
    let depth = 0
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++
      else if (src[i] === "}" && --depth === 0) {
        blocks.push(src.slice(open, i + 1))
        break
      }
    }
  }
  return blocks
}

const strings = (block: string, field: string) =>
  [...block.matchAll(new RegExp(`${field}:\\s*(["'\`])([^"'\`]*)\\1`, "g"))].map((m) => m[2])

describe("destructive confirms opened directly", () => {
  it("finds the openers it is meant to check", () => {
    const n = ["components", "app"].flatMap((d) => walk(resolve(root, d)))
      .reduce((sum, f) => sum + confirmAlertBlocks(readFileSync(f, "utf8")).length, 0)
    expect(n).toBeGreaterThan(20)
  })

  it("marks every delete, remove, revoke or leave as destructive", () => {
    const offenders: string[] = []
    for (const file of ["components", "app"].flatMap((d) => walk(resolve(root, d)))) {
      for (const block of confirmAlertBlocks(readFileSync(file, "utf8"))) {
        const words = [...strings(block, "title"), ...strings(block, "confirmText")]
        if (words.some((w) => DANGER.test(w)) && !/destructive:\s*true/.test(block)) {
          offenders.push(`${relative(root, file)}: ${words.join(" / ")}`)
        }
      }
    }
    expect(offenders, `add destructive: true to these confirmAlert data blocks:\n${offenders.join("\n")}`).toEqual([])
  })
})
