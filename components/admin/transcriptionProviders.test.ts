import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Every speech-to-text provider must be selectable, described, and consistent
 * about whether it needs a key.
 *
 * The bug this exists for: the provider dropdown listed its three options by
 * hand while the labels lived in a Record keyed on the provider union. Adding a
 * provider satisfied the type (a label was required) and still produced an
 * option nobody could choose, because the list was a separate hand-written
 * copy. Source is read here rather than rendered, matching the other guards in
 * this repo.
 */

const source = readFileSync(join(__dirname, "TranscriptionSettingsCard.tsx"), "utf8")
const service = readFileSync(join(__dirname, "..", "..", "services", "settingsService.ts"), "utf8")

/** The provider union, read from the type so the test cannot drift from it. */
function declaredProviders(): string[] {
    const m = service.match(/export type STTProvider =([^\n]+)/)
    expect(m, "STTProvider union not found in settingsService.ts").toBeTruthy()
    return [...(m as RegExpMatchArray)[1].matchAll(/"([a-z-]+)"/g)].map((x) => x[1])
}

describe("speech-to-text providers", () => {
    const providers = declaredProviders()

    it("has more than one, or this check proves nothing", () => {
        expect(providers.length).toBeGreaterThan(1)
        expect(providers).toContain("local")
    })

    it("labels and describes every one", () => {
        for (const p of providers) {
            expect(source, `PROVIDER_LABEL.${p}`).toMatch(new RegExp(`${p}:\\s*"`))
        }
        // Two records, both keyed on the union: label and the note under it.
        expect((source.match(/const PROVIDER_LABEL/g) ?? []).length).toBe(1)
        expect((source.match(/const PROVIDER_NOTE/g) ?? []).length).toBe(1)
    })

    it("builds the dropdown from the record instead of listing options by hand", () => {
        // The actual regression guard. A hand-written <SelectItem value="..."> per
        // provider is how one of them ends up unselectable.
        expect(source).toMatch(/Object\.keys\(PROVIDER_LABEL\)/)
        expect(source).not.toMatch(/<SelectItem value="deepgram">/)
    })

    it("says the bundled server keeps audio on the machine, and asks it for no key", () => {
        // The one thing that distinguishes it, and the reason someone picks it.
        expect(source).toMatch(/never leaves this server/i)
        // usesApiKey must not include the bundled provider.
        const m = source.match(/const usesApiKey = ([^\n]+)/)
        expect(m).toBeTruthy()
        expect((m as RegExpMatchArray)[1]).not.toMatch(/"local"/)
    })
})
