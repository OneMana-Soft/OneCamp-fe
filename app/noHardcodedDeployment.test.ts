import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * No source file may name a specific deployment.
 *
 * WHY THIS EXISTS. Every one of these was real, shipped, and invisible:
 *
 *   next.config remotePatterns    our object store, so next/image returned 400
 *                                 for every avatar on every install but ours
 *   useCollaborationProvider      our collaboration server as the fallback, so a
 *                                 missing variable opened a websocket to us
 *   EmailSettingsCard             our domain prefilled as the customer's sender
 *                                 address, adopted the moment they pressed Save
 *   EmailSettingsCard preview     a signup link to our workspace, shown to them
 *
 * None failed loudly. The build succeeded, the page rendered, and the product
 * pointed at the wrong place. That is the shape this check is for: a literal
 * hostname is always somebody's, and in a self-hosted product it is never the
 * reader's.
 *
 * COMMENTS ARE EXEMPT, and deliberately. Several of the fixes above are worth
 * explaining, and explaining them means naming what was there. A check that
 * forbids describing a bug teaches people to delete the description.
 */

const ROOTS = ["app", "components", "hooks", "lib", "services", "store"]
const EXTRA_FILES = ["next.config.ts"]

/**
 * Hostnames that belong to a specific deployment of this product. Bare "onemana"
 * is not enough: the company name legitimately appears in copy.
 */
const DEPLOYMENT_HOST = /\b[a-z0-9-]*\.?onemana\.dev\b/i

/** Comments are documentation, not configuration. See the header. */
function stripComments(src: string): string {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|\s)\/\/[^\n]*/g, "$1")
}

function walk(dir: string, out: string[] = []): string[] {
    let entries: string[]
    try {
        entries = readdirSync(dir)
    } catch {
        return out
    }
    for (const entry of entries) {
        if (entry === "node_modules" || entry.startsWith(".")) continue
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p, out)
        // Tests may name a host: asserting on one is the opposite of shipping one.
        else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p)
    }
    return out
}

describe("source files", () => {
    it("name no specific deployment outside comments", () => {
        const offenders: string[] = []
        for (const file of [...ROOTS.flatMap((r) => walk(r)), ...EXTRA_FILES]) {
            const hit = stripComments(readFileSync(file, "utf8")).match(DEPLOYMENT_HOST)
            if (hit) offenders.push(`${file}: ${hit[0]}`)
        }

        expect(
            offenders,
            "a source file names a specific deployment. In a self-hosted product a " +
                "literal hostname is somebody else's server: it builds, it renders, and " +
                "it points the customer at the wrong place. Derive it from the " +
                "NEXT_PUBLIC_ configuration instead.",
        ).toEqual([])
    })
})
