import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// An icon button with no name is a button only a sighted person who already
// knows the product can use.
//
// The UI critique called the channel header "icon soup"; the same shape was in
// sixty-three places, including every admin card's edit and delete, the call
// bar, the audio player and the nine long-press drawers, where the reaction
// buttons announced an emoji character and the one next to them announced
// nothing at all.
//
// A ratchet, not a ban. The number may fall freely and any rise fails, so
// adding an unnamed control is a deliberate act rather than an oversight.
//
// The four still counted are the call buttons in the channel, chat and group
// headers: each sits inside a <Link aria-label=...>, so the link is the control
// and it is named, which this scanner cannot see from the button tag it is
// looking at. Verified individually. Lowering the number means proving the same
// of whatever remains, one at a time.
const ALLOWED = 4

const ROOT = join(__dirname, "..")
const SEARCH = ["app", "components"]

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

/** The end of the JSX tag that owns an attribute at `from`, ignoring braces. */
function tagEnd(src: string, from: number): number {
    let depth = 0
    for (let i = from; i < src.length; i++) {
        const c = src[i]
        if (c === "{") depth++
        else if (c === "}") depth--
        else if (c === ">" && depth === 0) return i
    }
    return src.length
}

describe("icon-only controls", () => {
    it("say what they are", () => {
        const found: string[] = []

        for (const dir of SEARCH) {
            for (const file of sourceFiles(join(ROOT, dir))) {
                // Commented-out JSX is not a control anybody can press.
                const src = readFileSync(file, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
                for (const m of src.matchAll(/size=['"]icon['"]/g)) {
                    const start = src.lastIndexOf("<", m.index)
                    const end = tagEnd(src, m.index! + m[0].length)
                    const tag = src.slice(start, end)
                    if (tag.includes("aria-label")) continue
                    // A name may also come from an sr-only child just inside it.
                    if (src.slice(end, end + 400).match(/sr-only|aria-label/)) continue
                    found.push(`${file.slice(ROOT.length + 1)}:${src.slice(0, start).split("\n").length}`)
                }
            }
        }

        expect(
            found.length,
            `icon-only controls with no accessible name:\n${found.join("\n")}\n` +
                `Name it after what its handler does. If a wrapping Link or trigger already ` +
                `names it, lower ALLOWED and say which.`,
        ).toBeLessThanOrEqual(ALLOWED)
    })

    it("is looking at the files that have them", () => {
        const counted = SEARCH.reduce((n, d) => n + sourceFiles(join(ROOT, d)).length, 0)
        expect(counted).toBeGreaterThan(200)
    })
})
