import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// OneCamp ships in two editions. v1 is built with no AI packages, so its backend serves
// no AI routes at all; on v2 an admin can switch AI off or leave a provider
// unconfigured. In both cases an AI button is a button whose every click fails, and the
// user only discovers that after clicking.
//
// The rule: ANY COMPONENT IN components/ai THAT IS RENDERED FROM OUTSIDE components/ai
// MUST GATE ITSELF on AI availability, via withAI or useAIAvailable.
//
// Gating at the render sites was the alternative and it does not hold: these entry
// points are mounted from roughly twenty-five places across desktop and mobile, so each
// new one has to remember, and the guard would have to know about all of them. Gating
// the component covers every present and future use.
//
// Components used ONLY by other AI components need no gate of their own, because
// whatever mounted them was already gated. That is why this reads the import graph
// rather than requiring a gate on all thirty-eight files: a blanket rule would demand
// pointless gates on leaf components and would then be weakened or ignored.

const AI_DIR = join(__dirname)
const REPO_ROOT = join(__dirname, "..", "..")

const SEARCH_DIRS = ["app", "components", "hooks", "lib", "store", "services"]

/** Source files anywhere in the app, excluding build output and tests. */
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
        if (!/\.(ts|tsx)$/.test(entry.name)) continue
        if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue
        acc.push(full)
    }
    return acc
}

/** AI component module names, e.g. "BriefingCard". */
function aiComponentNames(): string[] {
    return readdirSync(AI_DIR)
        .filter((f) => /\.tsx$/.test(f))
        .filter((f) => !/\.(test|spec)\.tsx$/.test(f))
        .map((f) => f.replace(/\.tsx$/, ""))
}

/**
 * Which AI components are imported from OUTSIDE components/ai. Those are the entry
 * points a user can reach, and the ones that must gate themselves.
 */
function externallyRenderedAIComponents(): Map<string, string[]> {
    const names = new Set(aiComponentNames())
    const reached = new Map<string, string[]>()

    for (const dir of SEARCH_DIRS) {
        for (const file of sourceFiles(join(REPO_ROOT, dir))) {
            // A file inside components/ai importing a sibling is internal composition.
            if (file.startsWith(AI_DIR)) continue

            const content = readFileSync(file, "utf8")
            for (const name of names) {
                // Match the module path, so a component mentioned in prose or in an
                // unrelated identifier does not count as a render.
                const importPattern = new RegExp(`from\\s+["'](?:@/components/ai|\\.{1,2}/[^"']*ai)/${name}["']`)
                if (!importPattern.test(content)) continue
                const rel = file.slice(REPO_ROOT.length + 1)
                reached.set(name, [...(reached.get(name) ?? []), rel])
            }
        }
    }
    return reached
}

/**
 * Components that live in components/ai but MUST NOT be gated, with the reason.
 *
 * This list is the careful half of the rule. Everything here renders CONTENT THAT IS
 * ALREADY SAVED rather than offering a control that calls AI, so hiding it would not
 * remove a dead button, it would erase something the user can see and expects to keep
 * seeing. Both entries are dependency-free renderers that make no network calls at all,
 * which is the test applied: does it invoke AI, or does it draw something AI produced
 * earlier?
 *
 * Gating them would be an actively worse bug than the one this file exists to prevent,
 * because it destroys visible data on the edition that HAS AI as well.
 */
const NOT_GATED_ON_PURPOSE: Record<string, string> = {
    MarkdownMessage:
        "a self-contained safe markdown renderer with no network calls, also used by the " +
        "command palette and the in-call panel. Gating it would stop non-AI markdown rendering too.",
    AgentChart:
        "a self-contained SVG renderer for a saved NormalizedChart, mounted by the tiptap " +
        "chart embed and by DataTableChart. A chart already embedded in a document must " +
        "keep rendering whether or not AI is available to make another one.",
}

/** Does this component gate itself on AI availability? */
function gatesItself(name: string): boolean {
    const content = readFileSync(join(AI_DIR, `${name}.tsx`), "utf8")
    return (
        /withAI\s*\(/.test(content) ||
        /withFeature\s*\(\s*FEATURE_AI/.test(content) ||
        /useAIAvailable\s*\(/.test(content) ||
        /useFeature\s*\(\s*FEATURE_AI/.test(content)
    )
}

describe("AI entry points are gated on AI availability", () => {
    it("finds AI components that are rendered from outside components/ai", () => {
        const reached = externallyRenderedAIComponents()
        // If this found nothing the two assertions below would pass vacuously forever.
        expect(
            reached.size,
            "no AI component appears to be imported from outside components/ai, which means " +
                "the import scan is broken rather than that nothing renders AI",
        ).toBeGreaterThan(3)
    })

    it("gates every externally rendered AI component", () => {
        const reached = externallyRenderedAIComponents()
        const ungated: string[] = []

        for (const [name, importers] of reached) {
            if (gatesItself(name)) continue
            if (NOT_GATED_ON_PURPOSE[name]) continue
            ungated.push(`${name} (rendered from ${importers.slice(0, 3).join(", ")}${importers.length > 3 ? `, +${importers.length - 3} more` : ""})`)
        }

        expect(
            ungated,
            "These AI components are reachable from outside components/ai but do not gate " +
                "themselves on AI availability. On the AI-free v1 edition, and on v2 with AI " +
                "switched off, they render controls whose every call fails. Wrap the export in " +
                "withAI() from @/components/common/withFeature.",
        ).toEqual([])
    })

    it("keeps the exemption list honest", () => {
        // The exemptions survive into the AI-free edition, so an entry that quietly stops
        // being a pure renderer is how an AI control gets shipped to a customer who bought
        // the edition without AI. Each one must still make no calls of its own.
        for (const name of Object.keys(NOT_GATED_ON_PURPOSE)) {
            const content = readFileSync(join(AI_DIR, `${name}.tsx`), "utf8")
            expect(
                content,
                `${name} is exempt from AI gating because it only renders saved content, but it ` +
                    `now makes requests. Either it is no longer a pure renderer and needs withAI(), ` +
                    `or the call belongs somewhere else.`,
            ).not.toMatch(/axiosInstance|useFetch\(|GetEndpointUrl\./)
        }
    })

    it("keeps the feature name identical to the backend's", () => {
        // helpers.FeatureNameAI on the backend. The frontend gates on this exact string,
        // and a mismatch fails silently by hiding AI on the edition that has it.
        const hook = readFileSync(join(REPO_ROOT, "hooks", "useClientConfig.ts"), "utf8")
        expect(hook).toContain('export const FEATURE_AI = "ai"')
    })

    it("defaults to no features so optional subsystems fail closed", () => {
        const hook = readFileSync(join(REPO_ROOT, "hooks", "useClientConfig.ts"), "utf8")
        // A default of {} is what makes an in-flight config request read as
        // "unavailable". Defaulting the other way would paint AI controls on a v1
        // server and then remove them, so the AI-free edition would flicker AI
        // features on every page load.
        expect(hook).toMatch(/features:\s*\{\}/)
    })
})
