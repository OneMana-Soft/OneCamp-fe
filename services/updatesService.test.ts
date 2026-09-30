import { describe, expect, it } from "vitest"
import { updateSummary, type UpdateStatus } from "./updatesService"

const base: UpdateStatus = {
    running: "v2.26.1",
    edition: "v2",
    latest: "v2.33.0",
    latest_by_line: { v1: "v1.20.0", v2: "v2.33.0" },
    update_available: true,
    managed: false,
    update_command: "run-the-installer",
    source: "releases.example",
    checked_at: "2026-09-30T12:00:00Z",
}

describe("updateSummary", () => {
    it("gives a self-hosted admin the command to run", () => {
        const s = updateSummary(base)
        expect(s.tone).toBe("available")
        expect(s.title).toBe("v2.33.0 is available")
        expect(s.body).toContain("v2.26.1")
        expect(s.command).toBe("run-the-installer")
    })

    it("tells a Cloud admin there is nothing to do", () => {
        const s = updateSummary({ ...base, managed: true, update_command: undefined })
        expect(s.tone).toBe("available")
        expect(s.command).toBeUndefined()
        expect(s.body).toContain("Nothing to do")
    })

    it("says up to date only when it is", () => {
        const s = updateSummary({ ...base, running: "v2.33.0", update_available: false })
        expect(s.tone).toBe("current")
        expect(s.command).toBeUndefined()
    })

    it("never claims up to date for a build that does not know its version", () => {
        const s = updateSummary({ ...base, running: "", edition: "", latest: "", update_available: false })
        expect(s.tone).toBe("unknown")
        expect(s.body).toContain("v1.20.0 (without AI)")
        expect(s.body).toContain("v2.33.0 (with AI)")
    })

    it("handles an edition with no published release", () => {
        const s = updateSummary({ ...base, running: "v3.0.0", edition: "v3", latest: "", update_available: false })
        expect(s.tone).toBe("unknown")
    })
})
