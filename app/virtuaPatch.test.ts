import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * node_modules/virtua is the patched build (patches/virtua@0.41.5.patch), in
 * both of the files the app loads. A lost patch (an install that skipped it, or
 * a new virtua) fails here, in every gate's unit run, not in a phone's taps:
 *   - touchcancel ends a finger as touchend does (added and removed once each);
 *   - the rows keep their pointer events while the list scrolls. virtua turned
 *     them off until 150 ms after the last scroll, so a press on a row that had
 *     just come to rest landed on the list (measured 27 Oct 2026).
 */
describe("the virtua build in node_modules", () => {
  for (const file of ["index.mjs", "index.js"]) {
    const code = readFileSync(join(process.cwd(), "node_modules/virtua/lib", file), "utf8")

    it(`${file} ends a cancelled touch as an ended one`, () => {
      expect(code.match(/"touchcancel"/g)?.length ?? 0).toBe(2)
    })

    it(`${file} never turns the rows' pointer events off while the list scrolls`, () => {
      expect(code).not.toMatch(/pointerEvents:[\w$]+\?"none"/)
      expect(code.match(/the rows keep their pointer events while the list scrolls/g)?.length ?? 0).toBe(2)
    })
  }
})
