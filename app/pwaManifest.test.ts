import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * OneCamp is installed as a PWA on phones and on desktops, so the manifest is
 * not decoration: it is what decides whether the thing people install behaves
 * like an app or like a bookmark that opens a browser.
 */

const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"))

describe("the installed app", () => {
    it("declares what an installable app must declare", () => {
        for (const key of ["name", "short_name", "start_url", "display", "scope", "theme_color", "background_color"]) {
            expect(manifest[key], `manifest.${key} is required for a clean install`).toBeTruthy()
        }
        // Anything less than standalone puts browser chrome around the app.
        expect(["standalone", "fullscreen", "minimal-ui"]).toContain(manifest.display)
    })

    it("ships a maskable icon", () => {
        // Without one, Android puts the square icon inside its own shape and the
        // result is a logo floating in a white box next to every native app.
        const maskable = (manifest.icons ?? []).filter((i: { purpose?: string }) =>
            (i.purpose ?? "").split(/\s+/).includes("maskable"),
        )
        expect(maskable.length, "no maskable icon: the launcher will letterbox it").toBeGreaterThan(0)
    })

    it("points its shortcuts at routes that exist", () => {
        // A long-press menu that opens a 404 is worse than no menu. These are
        // checked against the filesystem rather than trusted.
        for (const s of manifest.shortcuts ?? []) {
            const route = String(s.url).replace(/^\//, "")
            expect(
                existsSync(join("app", route)) || existsSync(join("app", route, "page.tsx")),
                `shortcut "${s.short_name}" points at ${s.url}, which is not a route`,
            ).toBe(true)
        }
    })

    it("keeps the theme colour equal to the pre-hydration one", () => {
        // They must match or the install splash flashes a different colour into
        // the app shell, which is the first thing a new user sees.
        const layout = readFileSync("app/layout.tsx", "utf8")
        const themed = layout.match(/themeColor:\s*"([^"]+)"/)
        expect(themed, "layout declares no themeColor").not.toBeNull()
        expect(String(manifest.theme_color).toLowerCase()).toBe(String(themed![1]).toLowerCase())
    })
})
