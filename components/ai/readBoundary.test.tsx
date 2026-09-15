import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"

import { ReadBoundary, boundaryText, GOVERNANCE_HREF } from "@/components/ai/ReadBoundary"

afterEach(cleanup)

describe("what a recap says about its own limits", () => {
    it("counts the workspace memberships it was allowed to read", () => {
        expect(boundaryText("workspace", 11)).toContain("11 conversations")
    })

    // A member of exactly one conversation gets a sentence, not "1 conversations".
    it("reads as English at one", () => {
        const text = boundaryText("workspace", 1)
        expect(text).toContain("the one conversation")
        expect(text).not.toMatch(/\b1 conversations\b/)
    })

    // A per-channel recap may read the channel it was asked about and nothing
    // else. Reporting the reader's wider membership there would describe a
    // boundary the recap never had.
    it("does not borrow the workspace count for a single conversation", () => {
        for (const scope of ["channel", "chat"] as const) {
            const text = boundaryText(scope, 11)
            expect(text).toBe("Read this conversation only.")
        }
    })

    // The claim is about what WAS opened. The number of rooms a member cannot
    // see is not theirs to learn, so no wording may imply it.
    it("never counts what it could not read", () => {
        const text = `${boundaryText("workspace", 4)}`
        expect(text).not.toMatch(/not read|withheld|skipped|denied/i)
    })

    // An older backend omits the field. Saying nothing is correct; claiming a
    // boundary we were not told about is the failure this guards.
    it("stays silent when the server sent no count", () => {
        expect(boundaryText("workspace", undefined)).toBe("")
        expect(boundaryText("workspace", 0)).toBe("")

        const { container } = render(<ReadBoundary scope="workspace" />)
        expect(container.textContent).toBe("")
    })

    it("offers the way through to the proof", () => {
        const { container } = render(<ReadBoundary scope="workspace" scopesAllowed={6} />)
        const link = container.querySelector("a")
        expect(link?.getAttribute("href")).toBe(GOVERNANCE_HREF)
        expect(container.textContent).toContain("Nothing outside that was opened.")
    })
})
