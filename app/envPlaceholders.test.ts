import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

/**
 * The committed .env.production must stay a set of placeholders.
 *
 * WHY THIS TEST EXISTS. It already went wrong. This file was committed holding a
 * live deployment's configuration: real backend, LiveKit, collaboration and MQTT
 * hostnames, a real Firebase project, and NEXT_PUBLIC_DEMO_MODE=true. Anybody who
 * cloned the repository and ran `pnpm build` got a workspace wired to somebody
 * else's servers, registering their users' devices against somebody else's push
 * project, showing a demo button on their own sign-in screen. Nothing failed. It
 * built, it started, and it pointed at the wrong place.
 *
 * Nothing in that file was a credential. Every NEXT_PUBLIC_ value is compiled into
 * the bundle the browser downloads, so a Firebase web key there is public whatever
 * we do. The defect is not disclosure, it is DESTINATION: a default that silently
 * sends a buyer's traffic somewhere they did not choose.
 *
 * The rule is a shape, not a list: every host must be under the placeholder
 * domain. That catches our own domain and equally catches a customer's, which is
 * the one a contributor is most likely to paste in by accident.
 *
 * Real values belong in .env.production.local (git-ignored, written by
 * `pnpm setup`) or in the environment itself. Both beat this file at build time.
 */

const PLACEHOLDER_DOMAIN = "your-domain.com"
const ENV_FILE = ".env.production"

/** Parses KEY=VALUE, dropping comments, blanks and surrounding quotes. */
function parseEnv(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of text.split("\n")) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eq = trimmed.indexOf("=")
        if (eq === -1) continue
        out[trimmed.slice(0, eq).trim()] = trimmed
            .slice(eq + 1)
            .trim()
            .replace(/^(['"])(.*)\1$/, "$2")
    }
    return out
}

/**
 * The hostname a value names, whether it is a full URL or a bare host. Returns
 * null for a value that names no host, so a non-host variable is not accidentally
 * asserted on.
 */
function hostOf(value: string): string | null {
    if (!value) return null
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
    try {
        const { hostname } = new URL(withScheme)
        return hostname.includes(".") ? hostname : null
    } catch {
        return null
    }
}

const env = parseEnv(readFileSync(ENV_FILE, "utf8"))

describe("the committed .env.production", () => {
    it("names no host outside the placeholder domain", () => {
        const offenders = Object.entries(env)
            .map(([key, value]) => [key, hostOf(value)] as const)
            .filter(([, host]) => host !== null)
            .filter(([, host]) => host !== PLACEHOLDER_DOMAIN && !host!.endsWith(`.${PLACEHOLDER_DOMAIN}`))
            .map(([key, host]) => `${key} -> ${host}`)

        expect(
            offenders,
            `a real hostname reached the committed ${ENV_FILE}. A fresh clone would build ` +
                `against it instead of against the buyer's own server. Put real values in ` +
                `.env.production.local (\`pnpm setup\`) or in the environment; both override ` +
                `this file at build time.`,
        ).toEqual([])
    })

    it("ships no populated Firebase project", () => {
        // Empty is the working state, not a gap: lib/firebase.ts checks these
        // before initialising, so empty means push is cleanly off. A plausible
        // wrong value passes that check and then fails in the browser instead.
        const populated = Object.entries(env)
            .filter(([key]) => key.startsWith("NEXT_PUBLIC_FIREBASE_"))
            .filter(([, value]) => value !== "")
            .map(([key]) => key)

        expect(
            populated,
            "a Firebase project reached the committed env file. Push tokens are only " +
                "redeemable by the project that issued them, so this registers a buyer's " +
                "users to a project they cannot send from.",
        ).toEqual([])
    })

    it("does not turn on demo mode", () => {
        // Demo mode adds a "try it without an account" button. That is for a public
        // demo, not for a workspace with real people in it.
        expect(env.NEXT_PUBLIC_DEMO_MODE ?? "false").not.toBe("true")
    })

    it("still satisfies what the build requires", () => {
        // Placeholders that do not parse would trade a wrong destination for a
        // broken build. lib/env.ts validates NEXT_PUBLIC_BACKEND_URL as a URL and
        // throws in production, so it has to be a syntactically valid one.
        for (const key of ["NEXT_PUBLIC_BACKEND_URL", "NEXT_PUBLIC_APP_URL"]) {
            expect(env[key], `${key} is missing from ${ENV_FILE}`).toBeDefined()
            expect(() => new URL(env[key]), `${key} is not a valid URL`).not.toThrow()
        }
    })
})
