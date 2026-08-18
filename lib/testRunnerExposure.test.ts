import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"

/**
 * Keeps the Vitest UI / API server switched off, which is what makes a known critical
 * advisory inapplicable to this repo.
 *
 * THE ADVISORY. GHSA-5xrq-8626-4rwp (CVE-2026-47429) is rated critical and covers every
 * vitest at or below 3.2.5, which includes the version pinned here. `npm audit` reports it,
 * and it looks alarming until you read the conditions. The advisory states that only users
 * who match ONE of these are affected:
 *
 *   1. explicitly expose the Vitest UI server to the network (--api.host / api.host), or
 *   2. run the Vitest UI or Browser Mode on Windows.
 *
 * It also says outright that the path traversal "is not possible on Linux as Linux errors if
 * a directory named ? does not exist".
 *
 * This repo meets neither condition: tests run with `vitest --run` on Linux locally and on
 * ubuntu-latest in CI, with no UI, no browser mode, and no api.host. So the finding does not
 * apply, and the remedy npm audit suggests — vitest 4 — is a major upgrade that additionally
 * requires Node >= 20.12, i.e. a toolchain bump to fix something that cannot happen here.
 *
 * WHY A TEST RATHER THAN A COMMENT. "We do not use the UI" is a property, and properties
 * drift. Someone adding a `test:ui` script for a debugging session would silently move this
 * repo into the affected set, and the audit finding would stop being a false positive without
 * anyone noticing. This fails first, with the reason.
 *
 * IF YOU DO WANT THE UI: run it ad hoc (`npx vitest --ui`) on a local machine rather than
 * committing a script, or upgrade to vitest 4 — where the privileged operations are gated
 * behind allowWrite/allowExec, disabled by default on a non-localhost host — and raise the
 * Node floor to match.
 */

const repoRoot = join(__dirname, "..")

function read(file: string): string {
    return readFileSync(join(repoRoot, file), "utf8")
}

describe("the test runner must not expose a UI or API server", () => {
    /**
     * VITEST commands only. Playwright has its own --ui and its own advisories; conflating
     * the two would fail on `playwright test --ui`, which is unrelated to this finding and a
     * perfectly reasonable thing to have.
     */
    function vitestScripts(): Array<[string, string]> {
        const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> }
        return Object.entries(pkg.scripts ?? {}).filter(([, cmd]) => /\bvitest\b/.test(cmd))
    }

    it("finds the vitest scripts it is meant to be checking", () => {
        // Guards against the filter above quietly matching nothing, which would make every
        // assertion below pass for the wrong reason.
        expect(vitestScripts().length).toBeGreaterThan(0)
    })

    it("declares no vitest script that starts the UI", () => {
        const offenders = vitestScripts().filter(([, cmd]) => /--ui\b/.test(cmd))

        expect(
            offenders.map(([name]) => name),
            "a committed script starts the Vitest UI. That moves this repo into the set " +
                "affected by GHSA-5xrq-8626-4rwp, which is currently a false positive only " +
                "because the UI is never started. Run it ad hoc instead, or upgrade to " +
                "vitest 4 and raise the Node floor.",
        ).toEqual([])
    })

    it("declares no vitest script that exposes the API server to the network", () => {
        const offenders = vitestScripts().filter(([, cmd]) => /--api\.host|--api\b/.test(cmd))

        expect(
            offenders.map(([name]) => name),
            "a committed script exposes the Vitest API server. The advisory's first " +
                "condition is exactly this, and it applies on every platform — not only " +
                "Windows.",
        ).toEqual([])
    })

    it("does not configure api.host or browser mode in the vitest config", () => {
        // Comments stripped: this file's own prose names these options.
        const config = read("vitest.config.ts").replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ")

        for (const option of ["api:", "host:", "browser:"]) {
            expect(
                config.includes(option),
                `vitest.config.ts sets ${option} — check it does not expose the API server ` +
                    `or enable browser mode, both of which are the advisory's preconditions.`,
            ).toBe(false)
        }
    })

    it("runs tests non-interactively in CI, so no server is left listening", () => {
        const ci = read(".github/workflows/ci.yml")
        expect(ci).toContain("vitest --run")
        expect(ci).not.toMatch(/vitest\s+--ui/)
        // ubuntu-latest, so the Windows-only traversal cannot apply even if a UI were started.
        expect(ci).toContain("ubuntu-latest")
    })
})
