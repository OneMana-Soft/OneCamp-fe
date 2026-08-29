import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/**
 * The README must describe OneCamp, not create-next-app.
 *
 * WHY THIS EXISTS. It already went wrong, and it went wrong through a route that
 * will recur. This repository is populated by squash imports from the internal
 * one ("feat: squash all changes from onecamp-fe since ..."), and the internal
 * repository still had the scaffold README that `create-next-app` writes. The
 * import copied it over the real one, and the front page of a product that sells
 * for money explained how to run create-next-app. It stayed that way through
 * several releases because nothing reads the README on the way past.
 *
 * The same import is how a live deployment's .env.production arrived here, which
 * envPlaceholders.test.ts now catches. This is the other half: two cheap checks
 * on the two files an import is most likely to carry and nobody is most likely
 * to look at.
 *
 * The assertions are about IDENTITY, not about content quality. A README can be
 * rewritten freely; it just may not stop being ours.
 */

const README = readFileSync("README.md", "utf8")

describe("the README", () => {
    it("is not the create-next-app scaffold", () => {
        // These three strings appear only in the generated file. Any one of them
        // means an import overwrote the real README.
        for (const marker of [
            "bootstrapped with [`create-next-app`]",
            "## Deploy on Vercel",
            "The easiest way to deploy your Next.js app",
        ]) {
            expect(README, `README contains scaffold text: ${marker}`).not.toContain(marker)
        }
    })

    it("says what the product is and where to get the backend", () => {
        // The frontend is useless on its own, so a README that does not point at
        // the backend has failed at its one job regardless of how it reads.
        expect(README).toContain("OneCamp")
        expect(README).toMatch(/onemana\.dev/)
    })

    it("documents how to configure it", () => {
        // The step every buyer performs. If a rewrite drops it, they are back to
        // hand-editing an env file whose defaults point somewhere that is not
        // theirs.
        expect(README).toContain("pnpm configure")
    })
})
