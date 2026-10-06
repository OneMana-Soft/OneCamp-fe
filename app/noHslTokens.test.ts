import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * The colour tokens are complete oklch colours (globals.css), so wrapping one in
 * hsl() is invalid CSS and the browser silently draws nothing: the editor's
 * colour swatches, the block handle's hover and a focus ring all shipped that
 * way. Use var(--token), or color-mix(in oklch, var(--token) N%, transparent)
 * for a tint.
 */
function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) sources(p, out)
    else if (/\.(tsx?|css)$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}

describe("colour tokens", () => {
  it("are oklch, which is why hsl() around them is wrong", () => {
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/--foreground:\s*oklch\(/)
  })

  it("are never wrapped in hsl()", () => {
    const offenders = ["components", "lib", "app", "hooks"]
      .flatMap((d) => sources(d))
      .filter((p) => /hsl\(\s*var\(--/.test(readFileSync(p, "utf8").replace(/\/\/.*$/gm, "")))
    expect(offenders).toEqual([])
  })
})
