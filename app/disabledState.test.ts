import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"
import { describe, expect, it } from "vitest"

/**
 * A ROW THAT IS ON IS NEVER DRAWN OFF (15 Oct 2026). cmdk writes
 * data-disabled="false" on every item it doesn't disable, and the interaction
 * layer read data-disabled by its presence: every palette row, picker and
 * mention list drew at half strength, with the not-allowed cursor and no
 * highlight under the keyboard. The layers read it by its value: empty
 * (Radix) or "true" (cmdk, settings rows).
 */

const LAYERS = ["app/interaction.css", "app/phone.css"]

function bareDisabled(file: string, css: string): string[] {
  const out: string[] = []
  postcss.parse(css, { from: file }).walkRules((r) => {
    if (/\[data-disabled\]/.test(r.selector)) out.push(`${file}:${r.source?.start?.line} ${r.selector.replace(/\s+/g, " ").slice(0, 90)}`)
  })
  return out
}

describe("disabled, read by its value (cmdk writes data-disabled=\"false\")", () => {
  it("no layer reads data-disabled by its presence alone", () => {
    const found = LAYERS.flatMap((f) => bareDisabled(f, readFileSync(join(process.cwd(), f), "utf8")))
    expect(found, `these treat cmdk's data-disabled="false" as disabled:\n${found.join("\n")}`).toEqual([])
  })

  it("bites on a bare [data-disabled] and passes one read by its value", () => {
    expect(bareDisabled("x.css", `[data-interactive]:is([aria-disabled="true"], [data-disabled]) { opacity: .5 }`)).toHaveLength(1)
    expect(bareDisabled("x.css", `[data-interactive]:is([data-disabled=""], [data-disabled="true"]) { opacity: .5 }`)).toEqual([])
  })
})
