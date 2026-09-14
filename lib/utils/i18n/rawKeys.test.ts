import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// A translation key rendered as itself.
//
// Seven task-table headers read "title", "status", "startDate", "dueDate",
// "createdDate" in the shipped product, and the status control offered
// "+ setStatus" with a "changeStatusPlaceHolder" search box. The cause was one
// character: `t("startDate")` had lost its `t`, leaving `("startDate")`, which
// is valid TypeScript, type-checks, renders, and says the wrong thing in every
// one of the 40-odd languages this app ships.
//
// Nothing else would have caught it. The key exists, the translations exist,
// the component compiles, and the only symptom is that the interface reads like
// a database schema. A UI review found it months after it shipped.
//
// The rule: a string that is a known translation key must not appear as a bare
// parenthesised expression. Calls that happen to take the same string as an
// argument (useState("view"), getMap("comments")) are excluded by requiring the
// paren to open an expression rather than follow a callee.

const REPO_ROOT = join(__dirname, "..", "..", "..")
const EN = join(__dirname, "locales", "en", "en.json")

const SEARCH_DIRS = ["app", "components", "hooks", "lib", "services", "store"]

/** `("someKey")` where the paren opens an expression, not a call's argument list. */
const BARE_PAREN_STRING = /(?<![\w.\]>])\(\s*"([A-Za-z][A-Za-z0-9_]*)"\s*\)/g

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

describe("translation keys", () => {
    it("are never rendered as themselves", () => {
        const keys = new Set(Object.keys(JSON.parse(readFileSync(EN, "utf8"))))
        const found: string[] = []

        for (const dir of SEARCH_DIRS) {
            for (const file of sourceFiles(join(REPO_ROOT, dir))) {
                const src = readFileSync(file, "utf8")
                for (const m of src.matchAll(BARE_PAREN_STRING)) {
                    if (!keys.has(m[1])) continue
                    const line = src.slice(0, m.index).split("\n").length
                    found.push(`${file.slice(REPO_ROOT.length + 1)}:${line} renders ("${m[1]}") instead of t("${m[1]}")`)
                }
            }
        }

        expect(found, found.join("\n")).toEqual([])
    })

    // The guard is only worth having if it is looking at the files that carry
    // the labels, so a move or a rename that empties its search has to fail
    // rather than pass quietly.
    it("is actually reading the interface", () => {
        const counted = SEARCH_DIRS.reduce((n, d) => n + sourceFiles(join(REPO_ROOT, d)).length, 0)
        expect(counted).toBeGreaterThan(200)
    })
})
