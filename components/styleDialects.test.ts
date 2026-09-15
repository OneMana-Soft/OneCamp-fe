import { readdirSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

// This app has one styling system: the tokens in globals.css, reached through
// Tailwind. A CSS or SCSS module is a second one, with its own idea of what a
// button, a modal and a list look like, and the UI critique named that as a
// visual dialect it could see in the repository.
//
// Ten of them arrived at once: components/kanbanComponents was dnd-kit's example
// set, complete with Button, ConfirmModal, FloatingControls, Grid, List and
// Wrapper, and nothing in the product ever imported one. They were deleted. The
// three that remain belong to the board's two live components, where the drag
// mechanics genuinely need stylesheet features Tailwind does not express.
//
// A ratchet, not a ban: the number may fall freely and any rise fails. Adding a
// stylesheet is then a deliberate act with a reason, which is all this asks for.
const ALLOWED = 3

const ROOT = join(__dirname, "..")
const SEARCH = ["app", "components", "lib", "hooks", "services", "store"]

function stylesheets(dir: string, acc: string[] = []): string[] {
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
            stylesheets(full, acc)
            continue
        }
        if (/\.module\.(css|scss)$/.test(entry.name)) acc.push(full.slice(ROOT.length + 1))
    }
    return acc
}

describe("styling dialects", () => {
    it("does not grow a second one", () => {
        const found = SEARCH.flatMap((d) => stylesheets(join(ROOT, d)))
        expect(
            found.length,
            `component stylesheets outside the token system:\n${found.join("\n")}\n` +
                `If one of these is genuinely needed, lower ALLOWED and say why here.`,
        ).toBeLessThanOrEqual(ALLOWED)
    })

    // The example set is gone. A barrel that re-exports a component nobody
    // imports keeps it alive to every reader and every bundler.
    it("keeps the board barrel to what the board uses", () => {
        const kanban = readdirSync(join(ROOT, "components/kanbanComponents"), { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
        expect(kanban.sort()).toEqual(["Container", "Item"])
    })
})
