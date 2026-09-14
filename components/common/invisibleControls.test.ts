import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Opacity hides a thing from the eye, not from the mouse.
//
// The message hover toolbar sat invisible over the top-right of every message
// in every channel, still taking clicks, so clicking a word there hit a react
// button nobody could see. Twenty-seven layers across the app were built the
// same way: revealed on hover with opacity, live to the pointer the whole time.
//
// Nothing catches this. It type-checks, it renders, it looks correct in a
// screenshot, and the only symptom is that a click sometimes does the wrong
// thing or nothing at all.
//
// The rule: a layer revealed by opacity on hover or focus must not take clicks
// while it is invisible. A layer that CONTAINS controls gets them back when it
// is shown; a decorative one (a tint, a rule, a bar, written self-closing)
// never takes them at all, or it eats the click you are about to make on what
// is underneath it.

const REPO_ROOT = join(__dirname, "..", "..")
const SEARCH_DIRS = ["app", "components"]

/** A className string that reveals its element with opacity. */
const REVEALED_BY_OPACITY = /"[^"\n]*opacity-0[^"\n]*"/g

function sourceFiles(dir: string, acc: string[] = []): string[] {
    let entries
    try {
        entries = readdirSync(dir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const entry of entries) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (["node_modules", ".next", "dist", "build", "coverage"].includes(entry.name)) continue
            sourceFiles(full, acc)
            continue
        }
        if (!entry.name.endsWith(".tsx")) continue
        if (/\.(test|spec)\.tsx$/.test(entry.name)) continue
        acc.push(full)
    }
    return acc
}

describe("a layer revealed on hover", () => {
    it("does not take clicks while it is invisible", () => {
        const found: string[] = []

        for (const dir of SEARCH_DIRS) {
            for (const file of sourceFiles(join(REPO_ROOT, dir))) {
                const src = readFileSync(file, "utf8")
                for (const m of src.matchAll(REVEALED_BY_OPACITY)) {
                    const classes = m[0]
                    const revealed =
                        classes.includes("group-hover:opacity-100") ||
                        classes.includes("focus-within:opacity-100")
                    if (!revealed || classes.includes("pointer-events")) continue
                    const line = src.slice(0, m.index).split("\n").length
                    found.push(
                        `${file.slice(REPO_ROOT.length + 1)}:${line} is invisible but still clickable; ` +
                            `add pointer-events-none (plus group-hover:pointer-events-auto if it holds controls)`,
                    )
                }
            }
        }

        expect(found, found.join("\n")).toEqual([])
    })

    it("is looking at the files that have them", () => {
        const counted = SEARCH_DIRS.reduce((n, d) => n + sourceFiles(join(REPO_ROOT, d)).length, 0)
        expect(counted).toBeGreaterThan(200)
    })
})
