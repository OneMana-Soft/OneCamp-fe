import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Invariants for the "this workspace cannot send email" banner.
 *
 * WHY THE BANNER EXISTS. The installer clears the mail key deliberately, so every freshly
 * provisioned workspace starts unable to send anything — and it is a state nobody can see from
 * inside. /auth/forgot-password answers "check your email" whether or not it could send (it always
 * does, so nobody can use it to discover which addresses have accounts), and an invitation that never
 * arrives looks like a slow mail server. The first person to find out is usually an admin who has
 * locked themselves out and now has no route back in over HTTP.
 *
 * Each invariant below is a way of getting this wrong that would be invisible in review.
 */

const banner = readFileSync(join(process.cwd(), "components/banner/EmailOffBanner.tsx"), "utf8")
const clientConfig = readFileSync(join(process.cwd(), "hooks/useClientConfig.ts"), "utf8")
const layout = readFileSync(join(process.cwd(), "app/app/LayoutContent.tsx"), "utf8")

describe("EmailOffBanner", () => {
    it("shows only to admins", () => {
        // A member cannot fix this. Shown to them it is not a nudge, it is the product
        // announcing itself as broken on every page.
        expect(banner).toMatch(/if\s*\(\s*!isAdmin/)
    })

    it("shows only when the server says email is off", () => {
        expect(banner).toMatch(/email_enabled/)
        // Guard order matters less than the guard existing, but all three conditions
        // must be present in the early return.
        expect(banner).toMatch(/!isAdmin\s*\|\|\s*email_enabled\s*\|\|\s*dismissed/)
    })

    it("defaults to assuming email works until the server says otherwise", () => {
        // The opposite default would paint this banner on every page load of every
        // healthy workspace for as long as the config request is in flight.
        expect(clientConfig).toMatch(/email_enabled:\s*true/)
    })

    it("can be dismissed, and stays dismissed", () => {
        // It is a nudge, not an alarm. An admin who has decided to run without email
        // must not be nagged for the life of the workspace.
        expect(banner).toMatch(/localStorage\.setItem/)
        expect(banner).toMatch(/localStorage\.getItem/)
    })

    it("never lets storage being unavailable break the app", () => {
        // Private browsing and some embedded webviews throw on localStorage access.
        // A banner is not worth a white screen.
        const tryCount = (banner.match(/try\s*\{/g) ?? []).length
        expect(tryCount).toBeGreaterThanOrEqual(2)
    })

    it("links somewhere that can actually fix it", () => {
        expect(banner).toMatch(/\/app\/admin/)
    })

    it("is mounted on both the mobile and desktop layouts", () => {
        // Mounted once, an admin on the other form factor never sees it.
        const mounts = (layout.match(/<EmailOffBanner/g) ?? []).length
        expect(mounts).toBe(2)
    })
})
