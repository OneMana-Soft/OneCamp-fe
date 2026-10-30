import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

// Every write of elements to an Excalidraw scene says whose undo it belongs
// to (whiteboard programme W-0). Left out, Excalidraw folds the change into
// the person's next step, so their undo takes it back: a teammate's shape,
// a template, everything a board opened with (e2e/boardUndo.spec.ts). The
// shared document's copies go through lib/board/binding (NEVER); a person's
// own insert is IMMEDIATELY.

const ROOT = join(__dirname, "..", "..")
const DIRS = ["app", "components", "hooks", "lib"]

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

/** The text inside each `updateScene(…)` call, parentheses balanced. */
function calls(src: string): string[] {
  const out: string[] = []
  let at = src.indexOf("updateScene(")
  while (at >= 0) {
    let depth = 0
    let i = at + "updateScene".length
    for (; i < src.length; i++) {
      if (src[i] === "(") depth++
      else if (src[i] === ")" && --depth === 0) break
    }
    out.push(src.slice(at, i + 1))
    at = src.indexOf("updateScene(", i)
  }
  return out
}

describe("writes to a board's scene", () => {
  it("say whose undo they belong to", () => {
    const missing: string[] = []
    let seen = 0
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const src = readFileSync(file, "utf8")
        for (const call of calls(src)) {
          if (!/\belements\b/.test(call)) continue
          seen++
          if (!/\bcaptureUpdate\s*:/.test(call)) missing.push(`${relative(ROOT, file)}: ${call.replace(/\s+/g, " ").slice(0, 120)}`)
        }
      }
    }
    expect(seen, "the scan found the board's element writes").toBeGreaterThan(2)
    expect(missing).toEqual([])
  })

  it("take the shared document's copies through the one binding", () => {
    for (const file of ["components/board/boardCanvas.tsx", "components/guest/GuestBoardViewer.tsx"]) {
      const src = readFileSync(join(ROOT, file), "utf8")
      expect(src, file).toMatch(/followShared\(api, yElements as unknown as SharedElements/)
      expect(src, `${file} keeps no merge of its own`).not.toMatch(/function cloneElement/)
    }
  })
})
