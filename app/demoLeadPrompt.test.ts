import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Invariants for the demo-only lead prompt.
 *
 * The prompt asks a visitor for an email address. It ships inside the product that
 * every customer self-hosts, so the failure that matters is not "it did not
 * appear" — it is appearing in somebody's own workspace and asking their staff for
 * their address on behalf of a vendor. Each check below is a way of getting that
 * wrong that would look fine in review.
 */

const prompt = readFileSync(join(process.cwd(), "components/banner/DemoLeadPrompt.tsx"), "utf8")
const layout = readFileSync(join(process.cwd(), "app/app/LayoutContent.tsx"), "utf8")

describe("DemoLeadPrompt", () => {
    it("renders only when the workspace is a demo", () => {
        // The same flag that already gates the Try Demo button. A customer's install
        // has it unset, so the component returns before doing anything at all.
        expect(prompt).toContain("NEXT_PUBLIC_DEMO_MODE")
        expect(prompt).toMatch(/if \(!DEMO/)
    })

    it("cannot post anywhere it was not explicitly told to", () => {
        // Belt and braces. If demo mode were ever on by accident, an absent
        // endpoint still makes the component inert rather than posting an address
        // to a default that happens to be somebody's server.
        expect(prompt).toContain("NEXT_PUBLIC_SUBSCRIBE_URL")
        expect(prompt).toMatch(/SUBSCRIBE_URL\s*=\s*process\.env\.NEXT_PUBLIC_SUBSCRIBE_URL \|\| ""/)
        expect(prompt).toMatch(/!SUBSCRIBE_URL/)
    })

    it("waits before asking", () => {
        // A prompt in the first ten seconds interrupts the evaluation it is asking
        // for, and gets dismissed by somebody who had not yet decided they liked it.
        const delay = prompt.match(/SHOW_AFTER_MS\s*=\s*([\d_]+)/)
        expect(delay).not.toBeNull()
        expect(Number(delay![1].replace(/_/g, ""))).toBeGreaterThanOrEqual(30_000)
    })

    it("remembers a no", () => {
        // Asked and refused, or asked and answered, both mean stop asking. A visitor
        // re-prompted on every page has been told what this product thinks of them.
        expect(prompt).toContain("DISMISSED_KEY")
        expect(prompt.match(/localStorage\.setItem\(DISMISSED_KEY/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    })

    it("survives storage being unavailable", () => {
        // localStorage throws outright in some privacy modes. A prompt is never
        // worth an exception in the layout that wraps the whole application.
        const reads = prompt.match(/try\s*\{/g)?.length ?? 0
        expect(reads).toBeGreaterThanOrEqual(3)
    })

    it("is mounted wherever the email banner is", () => {
        // The layout has two branches. A prompt mounted in one of them is a prompt
        // that half the visitors never see, which reads as it not working.
        const banners = layout.match(/<EmailOffBanner/g)?.length ?? 0
        const prompts = layout.match(/<DemoLeadPrompt/g)?.length ?? 0
        expect(prompts).toBe(banners)
    })
})
