import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { SystemCheckReport } from "@/services/systemCheckService"

// The two properties worth holding are both about what the card REFUSES to do,
// and both are the kind of thing a tidy-up silently removes.
//
//  1. It renders every check's scope, healthy ones included. A tick with no
//     scope tells an operator that something passed without telling them what,
//     which is how a self-hoster concludes a subsystem works when it does not.
//  2. An empty check list is not "all clear". Checks register themselves from
//     their own package, so a build that ships without a subsystem ships
//     without its check — indistinguishable from a clean run unless the card
//     says which it is.

const runSystemCheck = vi.fn()
vi.mock("@/services/systemCheckService", () => ({
    runSystemCheck: () => runSystemCheck(),
    systemCheckUrl: "/admin/system-check",
}))

import SystemCheckCard from "@/components/admin/SystemCheckCard"

const report = (over: Partial<SystemCheckReport> = {}): SystemCheckReport => ({
    healthy: 0,
    unhealthy: 0,
    total: 0,
    checked_at: 1_757_000_000,
    checks: [],
    ...over,
})

beforeEach(() => {
    cleanup()
    runSystemCheck.mockReset()
})

describe("SystemCheckCard", () => {
    it("shows what a passing check does and does not prove", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                healthy: 1,
                total: 1,
                checks: [
                    {
                        name: "entity-links",
                        kind: "behaviour",
                        describe: "Proves the link filter matches live rows; does not prove linking a doc works end to end.",
                        healthy: true,
                        took_ms: 12,
                    },
                ],
            }),
        )

        render(<SystemCheckCard />)

        await waitFor(() => expect(screen.getByText("entity-links")).toBeTruthy())
        expect(
            screen.getByText(/does not prove linking a doc works end to end/),
            "a healthy check must still state its scope",
        ).toBeTruthy()
    })

    it("carries the operator-facing reason when a check fails", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                unhealthy: 1,
                total: 1,
                checks: [
                    {
                        name: "github-sync",
                        kind: "behaviour",
                        describe: "Looks at queued syncs in the last 24 hours.",
                        healthy: false,
                        detail: "67 of 69 queued syncs could not succeed: the task has no linked repository.",
                        took_ms: 40,
                    },
                ],
            }),
        )

        render(<SystemCheckCard />)

        await waitFor(() => expect(screen.getByText(/67 of 69 queued syncs/)).toBeTruthy())
        expect(screen.getByText(/1 of 1 need attention/)).toBeTruthy()
    })

    it("does not report an empty build as all clear", async () => {
        runSystemCheck.mockResolvedValue(report())

        render(<SystemCheckCard />)

        await waitFor(() => expect(screen.getByText(/No checks in this build/)).toBeTruthy())
        expect(
            screen.queryByText(/All 0 healthy/),
            "zero registered checks is not a clean run",
        ).toBeNull()
    })

    it("keeps a failure to reach the checker on the page rather than in a toast", async () => {
        runSystemCheck.mockRejectedValue(new Error("network down"))

        render(<SystemCheckCard />)

        await waitFor(() => expect(screen.getByText("Unavailable")).toBeTruthy())
    })

    it("puts dependencies above features, so a broken install is not read past", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                healthy: 2,
                total: 2,
                checks: [
                    {
                        name: "storage",
                        kind: "dependency",
                        describe: "MinIO is reachable and the upload bucket exists.",
                        healthy: true,
                        took_ms: 8,
                    },
                    {
                        name: "entity-links",
                        kind: "behaviour",
                        describe: "The soft-delete filter still selects live rows.",
                        healthy: true,
                        took_ms: 3,
                    },
                ],
            }),
        )

        const { container } = render(<SystemCheckCard />)

        await waitFor(() => expect(screen.getByText("storage")).toBeTruthy())
        const text = container.textContent ?? ""
        expect(
            text.indexOf("Services this install needs"),
            "the dependency section must come first",
        ).toBeLessThan(text.indexOf("Features that can break quietly"))
    })

    it("shows a note on a passing check instead of failing it", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                healthy: 1,
                total: 1,
                checks: [
                    {
                        name: "email",
                        kind: "dependency",
                        describe: "An email key is configured and readable.",
                        healthy: true,
                        detail: "no email key is set, so invitations are silently not sent",
                        took_ms: 2,
                    },
                ],
            }),
        )

        render(<SystemCheckCard />)

        const note = await waitFor(() => screen.getByText(/invitations are silently not sent/))

        // Asserting the text is present is not enough: it would still be present
        // if the note were rendered through the failure branch. What matters is
        // that it does NOT read as an error, so the class is the property.
        const noteBox = note.closest("p") ?? note
        expect(
            noteBox.className,
            "a note on a passing check must not be styled as a failure",
        ).not.toContain("text-destructive")
        expect(noteBox.className, "a note should read as advisory").toContain("text-warning")

        // And a deliberate choice must not paint the install red.
        expect(screen.getByText(/All 1 healthy/)).toBeTruthy()
        expect(screen.queryByText(/need attention/)).toBeNull()
    })
})
