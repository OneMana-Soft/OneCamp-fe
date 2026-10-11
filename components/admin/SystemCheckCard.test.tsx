import { beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false }) }))
vi.mock("@/services/systemCheckService", () => ({
    runSystemCheck: () => runSystemCheck(),
    systemCheckUrl: "/admin/system-check",
}))

import SystemCheckCard from "@/components/admin/SystemCheckCard"
import { TooltipProvider } from "@/components/ui/tooltip"
// Each tile names its check with its scope as a tooltip.
const renderCard = () => render(<TooltipProvider><SystemCheckCard /></TooltipProvider>)

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

        renderCard()

        await waitFor(() => expect(screen.getByText("Entity links")).toBeTruthy())
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

        renderCard()

        await waitFor(() => expect(screen.getByText(/67 of 69 queued syncs/)).toBeTruthy())
        expect(screen.getByText("1 needs attention")).toBeTruthy()
    })

    it("does not report an empty build as all clear", async () => {
        runSystemCheck.mockResolvedValue(report())

        renderCard()

        await waitFor(() => expect(screen.getByText(/No checks in this build/)).toBeTruthy())
        expect(
            screen.queryByText(/All 0 healthy/),
            "zero registered checks is not a clean run",
        ).toBeNull()
    })

    // It was an amber banner with no way to try again; every other section of the
    // admin page says a failed read the same way, under its title.
    it("keeps a failure to reach the checker on the page, under its title, with Try again", async () => {
        runSystemCheck.mockRejectedValueOnce(new Error("network down"))
        runSystemCheck.mockReturnValue(new Promise(() => {}))

        renderCard()

        expect(await screen.findByText(/Couldn't load the health check/)).toBeTruthy()
        expect(screen.getByText("network down")).toBeTruthy()
        expect(screen.getByRole("heading", { level: 2, name: "Installation health" })).toBeTruthy()
        // One way to try again: the error's own button, not a second "Run again" beside it.
        expect(screen.queryByRole("button", { name: /run again/i })).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /try again/i }))
        expect(runSystemCheck).toHaveBeenCalledTimes(2)
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

        const { container } = renderCard()

        await waitFor(() => expect(screen.getByText("Storage")).toBeTruthy())
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

        renderCard()

        const note = await waitFor(() => screen.getByText(/invitations are silently not sent/))

        // Asserting the text is present is not enough: it would still be present
        // if the note were rendered through the failure branch. What matters is
        // that it does NOT read as an error, so the class is the property.
        const noteBox = note.closest("p") ?? note
        expect(
            noteBox.className,
            "a note on a passing check must not be styled as a failure",
        ).not.toContain("text-danger-ink")
        expect(noteBox.className, "a note should read as advisory").toContain("text-warning-ink")

        // And a deliberate choice must not paint the install red.
        expect(screen.getByText(/All 1 healthy/)).toBeTruthy()
        expect(screen.queryByText(/need attention/)).toBeNull()
    })

    it("says on the page what this page cannot prove", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                healthy: 1,
                total: 1,
                checks: [
                    {
                        name: "search",
                        kind: "dependency",
                        describe: "OpenSearch is reachable and every index exists.",
                        healthy: true,
                        took_ms: 5,
                    },
                ],
            }),
        )

        renderCard()

        // An all-green read-only page reads as a working product unless it says
        // otherwise, which is the false comfort the whole feature exists to stop.
        await waitFor(() => expect(screen.getByText(/cannot prove/)).toBeTruthy())
        // The actual command, not just the word: a pointer an admin cannot run is no pointer.
        expect(screen.getByText("go-one-camp journey")).toBeTruthy()
    })
})

describe("how the health check reads", () => {
    // A spinner and "Probing each subsystem…" held no space, so the list
    // jumped in when it came.
    it("stands rows of the checks' shape in while it checks", () => {
        runSystemCheck.mockReturnValue(new Promise(() => {}))
        renderCard()
        expect(screen.getByRole("status", { name: "Checking the installation" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Checking…" })).toBeTruthy()
    })

    // Each check was a bordered card of its own.
    it("lists each group's checks as rows of one list", async () => {
        runSystemCheck.mockResolvedValue(
            report({
                healthy: 2,
                total: 2,
                checks: [
                    { name: "storage", kind: "dependency", describe: "MinIO is reachable.", healthy: true, took_ms: 8 },
                    { name: "search", kind: "dependency", describe: "OpenSearch is reachable.", healthy: true, took_ms: 5 },
                ],
            }),
        )
        renderCard()
        const list = await screen.findByRole("list", { name: "Services this install needs" })
        expect(list.querySelectorAll("li")).toHaveLength(2)
    })

    // Design v3 (A21): the verdict is the hero's summary, beside its ring and Run again.
    it("says its verdict in the summary hero, beside Run again", async () => {
        runSystemCheck.mockResolvedValue(
            report({ healthy: 1, total: 1, checks: [{ name: "email", kind: "dependency", describe: "A key is set.", healthy: true, took_ms: 2 }] }),
        )
        renderCard()
        const verdict = await screen.findByText("All 1 healthy")
        const hero = verdict.closest("[data-health-hero]") as HTMLElement
        expect(hero).toBeTruthy()
        expect(hero.querySelector("[data-health-ring]")).toBeTruthy()
        expect(hero.querySelector("button")?.textContent).toMatch(/Run again/)
    })

    // A bordered card with a p-4 header and a 32px tile beside a 16px title,
    // where every other admin tab is a flat section with a plain h2: switching
    // to Health moved the title 17px right and down.
    it("is a flat section with a plain h2 title, like every other admin tab", async () => {
        runSystemCheck.mockResolvedValue(report({ healthy: 1, total: 1, checks: [{ name: "email", kind: "dependency", describe: "A key is set.", healthy: true, took_ms: 2 }] }))
        const { container } = renderCard()
        await screen.findByText("Email")
        const root = container.firstElementChild as HTMLElement
        expect(root.tagName).toBe("SECTION")
        expect(root.className).not.toMatch(/(^|\s)border(\s|$)/)
        const h2 = screen.getByRole("heading", { level: 2, name: "Installation health" })
        expect(h2.querySelector(".hue-moss, svg")).toBeNull()
        // Each check's state is a word too, never colour alone.
        expect(screen.getByText("Healthy").closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
    })

    // The rows that stand in while it checks are the list's own rows, under the
    // first group's real heading, so nothing moves when the answer lands.
    it("stands the list's own rows in, under the first group's heading", () => {
        runSystemCheck.mockReturnValue(new Promise(() => {}))
        renderCard()
        const status = screen.getByRole("status", { name: "Checking the installation" })
        expect(screen.getByRole("heading", { level: 3, name: "Services this install needs" })).toBeTruthy()
        const rows = status.querySelectorAll("li")
        expect(rows.length).toBe(4)
        rows.forEach((li) => expect(li.className).toContain("cfg-tile"))
    })
})
