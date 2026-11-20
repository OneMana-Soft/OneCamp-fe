import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// A file asked for from the server (lib/utils/download's downloadFrom) comes
// back as a file when the server refuses too, with the refusal's words (its
// msg) unread inside it. So every caller reads them back first, through the
// one helper (lib/utils/downloadRefusal's withItsWords), and a refusal is said
// in the server's words, as any other answer's is. The time report's download
// and the task list's export read the file as it came, and said a status's
// words or "Try again in a moment." to a refusal (V-97, 30 Oct 2026).

const ROOT = join(__dirname, "..")
const DIRS = ["app", "components", "hooks", "lib", "services"]
const HELPER = "lib/utils/download.ts"

function sources(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sources(path))
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name)) out.push(path)
  }
  return out
}

// A caller may read them through a shared reader instead (one table's export
// and every table's say a refusal through lib/tables/exportRefusal's
// refusalOf, which loads withItsWords lazily): it calls a function it imports
// from a module of the app that itself calls withItsWords. One hop only.
function readsThroughAReader(src: string, read = (spec: string) => {
  const base = join(ROOT, spec)
  const file = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find(existsSync)
  return file ? readFileSync(file, "utf8") : ""
}): boolean {
  for (const [, names, spec] of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@\/([^"]+)"/g)) {
    if (!/\bwithItsWords\(/.test(read(spec))) continue
    const local = names.split(",").map((n) => n.trim().split(/\s+as\s+/).pop()!).filter((n) => /^\w+$/.test(n))
    if (local.some((n) => new RegExp(`\\b${n}\\(`).test(src.replace(/import\s*\{[^}]*\}\s*from\s*"[^"]+"/g, "")))) return true
  }
  return false
}

describe("a refused download is said in the server's words", () => {
  it("every caller of downloadFrom reads a failure back through withItsWords", () => {
    const callers = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .map((path) => ({ file: relative(ROOT, path), src: readFileSync(path, "utf8") }))
      .filter(({ file, src }) => file !== HELPER && /\bdownloadFrom\(/.test(src))
    // The scan finds the callers it knows of, so an empty scan can't pass.
    expect(callers.map(({ file }) => file)).toEqual(
      expect.arrayContaining(["components/project/ProjectTimeDialog.tsx", "lib/tables/exportRows.ts", "lib/tasks/exportTaskList.ts"]),
    )
    expect(callers.filter(({ src }) => !src.includes("withItsWords") && !readsThroughAReader(src)).map(({ file }) => file)).toEqual([])
  })

  it("a shared reader counts only when the caller calls it and it calls withItsWords", () => {
    const modules: Record<string, string> = {
      "lib/x/reader": "export async function readIt(e) { return (await import(\"@/lib/utils/downloadRefusal\")).withItsWords(e) }",
      "lib/x/plain": "export function sayIt(e) { return String(e) }",
    }
    const read = (spec: string) => modules[spec] ?? ""
    expect(readsThroughAReader(`import { readIt } from "@/lib/x/reader"\ncatch (e) { await readIt(e) }`, read)).toBe(true)
    expect(readsThroughAReader(`import { readIt as words } from "@/lib/x/reader"\ncatch (e) { await words(e) }`, read)).toBe(true)
    // Imported and never called, or a reader that never reads the words back: no.
    expect(readsThroughAReader(`import { readIt } from "@/lib/x/reader"\ncatch (e) { toast(String(e)) }`, read)).toBe(false)
    expect(readsThroughAReader(`import { sayIt } from "@/lib/x/plain"\ncatch (e) { sayIt(e) }`, read)).toBe(false)
  })
})
