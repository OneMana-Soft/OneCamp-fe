import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { describe, expect, it } from "vitest"

// On a phone, 100vh is the height with the browser's toolbars hidden, so a
// guest page sized h-screen put the call's controls and a page's foot under the
// address bar; w-screen added a sideways scrollbar wherever a vertical one
// showed. Guest pages size to the screen that is shown: dvh, and w-full.
const ROOT = resolve(__dirname, "..", "..")
function files(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, out)
    else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p)
  }
  return out
}

describe("guest pages", () => {
  it("never size themselves by 100vh or 100vw", () => {
    const found = [...files(join(ROOT, "app/guest")), ...files(join(ROOT, "components/guest"))]
      .filter((f) => /\b(?:min-)?h-screen\b|\bw-screen\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f))
    expect(found).toEqual([])
  })
})
