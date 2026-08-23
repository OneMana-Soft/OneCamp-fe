import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * This branch is the AI-FREE edition, and it must not render AI.
 *
 * WHY THIS TEST EXISTS. It already went wrong. The board page rendered an AI
 * panel and every channel's member settings rendered "AI Teammates" and "AI
 * Budget", unconditionally, against a v1 backend that has no AI endpoints at all.
 * So the people who choose this edition precisely because their policy forbids AI
 * were shown AI controls that could only fail.
 *
 * edition.go predicted it in a comment: pair the wrong halves and "the workspace
 * installs, passes every health check, and shows a customer buttons that return
 * 404". Nothing enforced it, so it happened, and nothing would have caught it
 * happening again the next time a component is cherry-picked from the ai branch.
 *
 * The check is on IMPORTS rather than on rendering, because an import is what
 * puts a component in the bundle, and "not even in the build" is the claim made
 * to customers.
 */

const ROOTS = ["app", "components"]

/** Imports of a module whose path names it as an AI surface. */
const AI_IMPORT = /^import[^\n]*from\s+["'][^"']*(?:\/|^)(?:[A-Za-z]*(?:AI|Ai)[A-Za-z]*)["']/gm

/**
 * EMPTY, AND IT SHOULD STAY THAT WAY. The in-call AI panel was the last entry and
 * has been removed: no import, no hook, no toolbar control. VideoControls already
 * renders its AI button only when a handler is passed, which is the path guests
 * have taken in production all along, so removing it rode a route that was
 * already exercised rather than a new one.
 *
 * An entry here is a customer-visible defect with a note attached. Prefer fixing
 * the import.
 */
const KNOWN_EXCEPTIONS: string[] = []

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry.startsWith(".")) continue
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
    }
    return out
}

describe("the AI-free edition", () => {
    it("imports no AI component outside the known exceptions", () => {
        const offenders: string[] = []
        for (const root of ROOTS) {
            for (const file of walk(root)) {
                const rel = file.replace(/\\/g, "/")
                if (KNOWN_EXCEPTIONS.includes(rel)) continue
                const src = readFileSync(file, "utf8")
                const hits = src.match(AI_IMPORT)
                if (hits) offenders.push(`${rel}: ${hits[0].trim()}`)
            }
        }
        expect(
            offenders,
            "an AI component reached the AI-free edition. It ships to customers whose " +
                "policy forbids AI, against a backend with no AI endpoints, so it can only " +
                "fail. Remove the import, or add it to KNOWN_EXCEPTIONS with a reason.",
        ).toEqual([])
    })

    it("keeps the exception list honest", () => {
        // An exception that no longer exists is a to-do somebody already did and
        // nobody deleted, which teaches the next reader the list is decorative.
        for (const rel of KNOWN_EXCEPTIONS) {
            const src = readFileSync(rel, "utf8")
            expect(src.match(AI_IMPORT), `${rel} is on the exception list but imports no AI component`).not.toBeNull()
        }
    })
})
