import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * A grid wider than a phone must be reachable on one.
 *
 * WHAT THIS CAUGHT. The calendar declared a 760px week grid and an 800px month
 * grid inside a scroller that offered only overflow-y, inside a <main> that
 * clips. The result on a 400px screen was not a cramped calendar and not a
 * calendar you could pan: it was a calendar with Thursday, Friday and Saturday
 * behind the right edge and no gesture that would ever bring them back. Nobody
 * noticed because the desktop, where the grid fits, is where it gets looked at.
 *
 * THE RULE. A file that pins an element wider than 600px at EVERY breakpoint
 * must also, somewhere in that file, hand the reader a horizontal scroller. A
 * width behind a `sm:` prefix is fine, because it is not in force on the screen
 * that cannot afford it, and that is the other honest fix: let the thing shrink.
 *
 * Deliberately a file-level check rather than a nesting one. Proving that a
 * particular div is inside a particular scrolling ancestor needs a real parse of
 * JSX that a regex will get wrong in both directions, and the looser rule still
 * makes the mistake impossible to commit in silence: either the width is
 * responsive, or the file says how it scrolls.
 *
 * A ratchet with no allowlist. Zero violations today; an addition fails here
 * rather than on somebody's phone.
 */
const ROOT = resolve(__dirname, "..", "..")
const SCAN = ["components", "app"]
const SKIP = new Set(["node_modules", ".next", ".git"])

/** Wider than any phone in portrait, with room to spare for the rounding. */
const PHONE_CEILING_PX = 600

/**
 * An unprefixed Tailwind min-width in pixels. The lookbehind is what makes it
 * unprefixed: `sm:min-w-[800px]` and `lg:min-w-[800px]` are the responsive form
 * this rule is asking for, not the thing it forbids.
 */
const PINNED_WIDTH = /(?<![a-z:-])min-w-\[(\d{3,})px\]/g
const HAS_X_SCROLLER = /overflow-x-(auto|scroll)|overflow-auto|overflow-scroll/

function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
            out.push(...sourceFiles(full))
            continue
        }
        if (!/\.tsx?$/.test(entry) || entry.includes(".test.")) continue
        out.push(full)
    }
    return out
}

describe("anything wider than a phone can be scrolled on one", () => {
    it("never pins a wide element in a file with no horizontal scroller", () => {
        const offenders: string[] = []

        for (const root of SCAN) {
            for (const file of sourceFiles(join(ROOT, root))) {
                const content = readFileSync(file, "utf8")
                const widths = [...content.matchAll(PINNED_WIDTH)]
                    .map((m) => Number(m[1]))
                    .filter((px) => px >= PHONE_CEILING_PX)
                if (widths.length === 0) continue
                if (HAS_X_SCROLLER.test(content)) continue
                offenders.push(`${relative(ROOT, file)} pins ${widths.join(", ")}px at every breakpoint`)
            }
        }

        expect(
            offenders,
            "These files force a width no phone has, with nothing to scroll. Either put the width behind a " +
                "breakpoint prefix so small screens get a narrower layout, or give the container overflow-x-auto " +
                "so the reader can pan to the rest of it.",
        ).toEqual([])
    })
})
