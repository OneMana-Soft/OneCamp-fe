import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Every page under /app renders inside MobileNavigationBar on a phone, so the top
// and bottom bars are always in the tree. Being in the tree is not the same as
// having anything in it: the top bar's three slots each switch on the first path
// segment and fall through to an empty fragment for a segment nobody added.
//
// That is how the five Settings pages came to render with no title, no back
// button and, because the bottom bar keyed off path depth, no bottom navigation
// either. On a phone the page was a dead end with only the browser gesture out.
//
// This guard fails when a new route appears without a title, which is the cheapest
// moment to notice.

const ROUTES_DIR = join(__dirname, "..", "..", "..", "app", "app")
const NAV_DIR = __dirname

/** Top-level segments under /app, e.g. "channel", "settings". */
function routeSegments(): string[] {
    return readdirSync(ROUTES_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        // A dynamic segment is named by its parent's case, not its own.
        .filter((e) => !e.name.startsWith("[") && !e.name.startsWith("("))
        .map((e) => e.name)
}

function navSource(file: string): string {
    return readFileSync(join(NAV_DIR, file), "utf8")
}

describe("mobile navigation covers every route", () => {
    it("gives every top-level route a title", () => {
        const src = navSource("mobileTopNavigationBarSecond.tsx")
        const missing = routeSegments().filter((seg) => !src.includes(`case "${seg}":`))
        expect(missing, `no title case in the mobile top bar for: ${missing.join(", ")}`).toEqual([])
    })

    it("gives every top-level route a left slot", () => {
        const src = navSource("mobileTopNavigationBarFirst.tsx")
        const missing = routeSegments().filter((seg) => !src.includes(`case "${seg}":`))
        expect(missing, `no back button or org avatar for: ${missing.join(", ")}`).toEqual([])
    })

    it("keeps the bottom bar unless a surface owns the bottom edge", () => {
        const src = navSource("mobileBottomNavigationBar.tsx")
        // The rule must stay a named list rather than a depth heuristic. Depth is
        // what silently removed navigation from pages that merely happened to nest.
        expect(src).toContain("BOTTOM_OWNED_BY_PAGE")
        expect(src).not.toContain("pathLength")

        // Settings is the case that broke, so it is the case worth pinning.
        const rules = src.slice(src.indexOf("BOTTOM_OWNED_BY_PAGE"), src.indexOf("const isVisible"))
        expect(rules).not.toContain("settings")
    })
})
