import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// Source-level, because AgentsCard needs SWR, Redux, capabilities and half a
// dozen dialogs before it renders a row. What must not drift is that the row
// names the person, and what it says when it cannot.

const SRC = readFileSync(join(__dirname, "AgentsCard.tsx"), "utf8")

describe("an agent in the control plane", () => {
    // The row showed the tools it may call, its autonomy and its budget, and
    // never whose permissions bound it — which is the one claim the product
    // makes about agents.
    it("names the person it acts as", () => {
        expect(SRC).toContain("created_by_name")
        expect(SRC).toMatch(/Acts as/)
    })

    it("says so plainly when that person has gone, rather than showing an id", () => {
        expect(SRC).toMatch(/no longer in the workspace/)
        expect(SRC, "a uuid is not a person").not.toMatch(/created_by\}/)
    })

    // The label has to come from the server, not be invented here: the id is on
    // the row and resolving it client-side would be one request per agent.
    it("reads the label the server resolved", () => {
        expect(SRC).not.toMatch(/fetchUser|getUserById|resolveName/)
    })
})
