import { describe, expect, it } from "vitest"

import { FOLDED_NAV_TITLES, partitionByTitle } from "@/lib/nav/focusMode"
import { buildPrimaryNavLinks } from "@/lib/nav/primaryNavLinks"

const at = (segment: string) => `/app/${segment}`.split("/")
const quiet = { channel: 0, dm: 0, activity: 0 }

describe("the desktop rail under focus mode", () => {
    // The two lists meet nowhere else. Rename a rail entry, forget this
    // constant, and the module quietly returns to the top level — which is
    // exactly the state focus mode exists to undo.
    it("folds only titles the rail actually has", () => {
        const titles = buildPrimaryNavLinks(at("home"), quiet, true).map((l) => l.title)
        for (const folded of FOLDED_NAV_TITLES) {
            expect(titles, `${folded} is folded but no longer in the rail`).toContain(folded)
        }
    })

    it("leaves the surfaces people live in as peers", () => {
        const { kept } = partitionByTitle(buildPrimaryNavLinks(at("home"), quiet, true), FOLDED_NAV_TITLES)
        expect(kept.map((l) => l.title)).toEqual([
            "Home",
            "Channels",
            "DMs",
            "My Tasks",
            "Activity",
            "Admin",
        ])
    })

    it("folds the occasional destinations", () => {
        const { folded } = partitionByTitle(buildPrimaryNavLinks(at("home"), quiet, true), FOLDED_NAV_TITLES)
        expect(folded.map((l) => l.title)).toEqual(["Calendar", "Tables", "Templates"])
    })

    it("keeps Admin out of the rail for everyone else", () => {
        const titles = buildPrimaryNavLinks(at("home"), quiet, false).map((l) => l.title)
        expect(titles).not.toContain("Admin")
    })

    // A folded destination still has to know it is the current page, or the
    // sidebar cannot open onto it.
    it("marks a folded destination as current when you are on it", () => {
        const links = buildPrimaryNavLinks(at("tables"), quiet, false)
        expect(links.find((l) => l.title === "Tables")?.variant).toBe("sidebarActive")
        expect(links.find((l) => l.title === "Home")?.variant).toBe("ghost")
    })

    it("counts unread per surface rather than in one lump", () => {
        const links = buildPrimaryNavLinks(at("home"), { channel: 3, dm: 12, activity: 0 }, false)
        expect(links.find((l) => l.title === "Channels")?.label).toBe("3")
        expect(links.find((l) => l.title === "DMs")?.label).toBe("12")
        expect(links.find((l) => l.title === "Activity")?.label).toBe("")
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
        expect(folded).toEqual([])
    })
})
