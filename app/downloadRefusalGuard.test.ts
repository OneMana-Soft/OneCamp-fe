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

describe("a refused download is said in the server's words", () => {
  it("every caller of downloadFrom reads a failure back through withItsWords", () => {
    const callers = DIRS.flatMap((d) => sources(join(ROOT, d)))
      .map((path) => ({ file: relative(ROOT, path), src: readFileSync(path, "utf8") }))
      .filter(({ file, src }) => file !== HELPER && /\bdownloadFrom\(/.test(src))
    // The scan finds the callers it knows of, so an empty scan can't pass.
    expect(callers.map(({ file }) => file)).toEqual(
      expect.arrayContaining(["components/project/ProjectTimeDialog.tsx", "lib/tables/exportRows.ts", "lib/tasks/exportTaskList.ts"]),
    )
    expect(callers.filter(({ src }) => !src.includes("withItsWords")).map(({ file }) => file)).toEqual([])
  })
})
