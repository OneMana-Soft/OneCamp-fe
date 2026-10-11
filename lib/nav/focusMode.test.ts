import { describe, expect, it } from "vitest"

import { FOLDED_NAV_TITLES, partitionByTitle } from "@/lib/nav/focusMode"
import { buildPrimaryNavLinks, inboxBadgeCount } from "@/lib/nav/primaryNavLinks"

const at = (segment: string) => `/app/${segment}`.split("/")
const quiet = { channel: 0, dm: 0, activity: 0 }

describe("the desktop sidebar's primary rows (design v3, shell S5)", () => {
    // The two lists meet nowhere else. Rename a row, forget this constant,
    // and the page quietly returns to the top level.
    it("folds only titles the sidebar actually has", () => {
        const titles = buildPrimaryNavLinks(at("home"), quiet, true).map((l) => l.title)
        for (const folded of FOLDED_NAV_TITLES) {
            expect(titles, `${folded} is folded but no longer listed`).toContain(folded)
        }
    })

    it("keeps four rows people live in", () => {
        const { kept } = partitionByTitle(buildPrimaryNavLinks(at("home"), quiet, true), FOLDED_NAV_TITLES)
        expect(kept.map((l) => l.title)).toEqual(["Home", "Inbox", "My tasks", "Later"])
    })

    it("puts every page that isn't daily behind More", () => {
        const { folded } = partitionByTitle(buildPrimaryNavLinks(at("home"), quiet, true), FOLDED_NAV_TITLES)
        expect(folded.map((l) => l.title)).toEqual([
            "Calendar", "Tables", "Templates", "Docs", "Boards", "Mail", "Goals", "Reports", "Workload", "Recordings", "Teams",
        ])
    })

    it("lists Channels, DMs and Admin nowhere in the rows: sections and the workspace menu hold them", () => {
        const titles = buildPrimaryNavLinks(at("home"), quiet, true).map((l) => l.title)
        for (const gone of ["Channels", "DMs", "Activity", "Admin"]) expect(titles).not.toContain(gone)
    })

    // A folded destination still has to know it is the current page, or More
    // cannot show where you are.
    it("marks a folded destination as current when you are on it", () => {
        const links = buildPrimaryNavLinks(at("tables"), quiet, false)
        expect(links.find((l) => l.title === "Tables")?.variant).toBe("sidebarActive")
        expect(links.find((l) => l.title === "Home")?.variant).toBe("ghost")
    })

    it("counts Inbox from what has no row of its own, plus urgent nudges, and never DMs", () => {
        const links = buildPrimaryNavLinks(at("home"), { channel: 3, dm: 12, activity: 2, urgentNudges: 1 }, false)
        expect(links.find((l) => l.title === "Inbox")?.label).toBe("3")
        expect(inboxBadgeCount({ activity: 0, urgentNudges: 0 })).toBe(0)
        expect(buildPrimaryNavLinks(at("home"), quiet, false).find((l) => l.title === "Inbox")?.label).toBe("")
    })

    it("shows how many saved-for-later reminders have come, and nothing otherwise", () => {
        const due = buildPrimaryNavLinks(at("home"), { ...quiet, laterDue: 2 }, false)
        expect(due.find((l) => l.title === "Later")?.label).toBe("2")
        const onLater = buildPrimaryNavLinks(at("later"), quiet, false)
        expect(onLater.find((l) => l.title === "Later")?.variant).toBe("sidebarActive")
    })
})

describe("partitionByTitle", () => {
    it("preserves order on both sides", () => {
        const { kept, folded } = partitionByTitle(
            [{ title: "a" }, { title: "b" }, { title: "c" }, { title: "d" }],
            ["d", "b"],
        )
        expect(kept.map((i) => i.title)).toEqual(["a", "c"])
        expect(folded.map((i) => i.title)).toEqual(["b", "d"])
    })

    it("folds nothing when nothing matches", () => {
        const { kept, folded } = partitionByTitle([{ title: "a" }], ["z"])
        expect(kept).toHaveLength(1)
        expect(folded).toHaveLength(0)
    })
})
