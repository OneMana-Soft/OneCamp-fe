import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, renderHook } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

// Docs incident, 14 Oct 2026. Whatever a member's right comes from (being
// its author, a direct share, the workspace's general access, a team, the
// doc's space, full access, a hand-over), the server now answers the level
// the Access Resolver gives in every doc answer's counts, and every surface
// offers by that level alone (lib/docs/abilities): the comment box from
// comment, said and not hidden below it; the selection bar at view and
// comment, with only what the level allows; Share at full. The comment box
// hid from everyone whose right wasn't a direct share, and the selection bar
// from every reader. This edition has no AI: a reader's bar offers
// commenting alone, so it has nothing for a viewer.

const ME = "u-member"
const SOMEONE = "u-owner"
let answer: Record<string, unknown> = {}

// One answer object per key and doc, as SWR keeps it: a new object on every
// render would seed the store again each time.
const answers = new Map<string, unknown>()
const PROFILE = { data: { data: { user_uuid: ME, user_name: "Ola" } } }
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (key: string) => {
        if (!answers.has(key)) {
            answers.set(key, {
                data: key.startsWith("/doc/getDocInfo") ? { data: answer } : key.startsWith("/doc/access/requests") ? { data: { incoming: [], outgoing: [] } } : key.startsWith("/doc/access/") ? { data: { level: "view", can_request: false } } : undefined,
                isError: undefined,
                mutate: () => undefined,
            })
        }
        return answers.get(key)
    },
    useFetchOnlyOnce: () => PROFILE,
}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => undefined }))
vi.mock("@/components/threads/useThreads", () => ({
    messageOf: () => "",
    useThreads: () => ({ threads: [], status: "ready", refresh: async () => undefined, create: async () => ({ comments: [] }), reply: async () => undefined, actions: {} }),
}))

import { useDocThreads } from "@/components/docComments/useDocThreads"
import "@/components/docEditor/registry"
import { actionGroupsFor } from "@/components/docEditor/registry/readers"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import { readerOffers } from "@/components/docEditor/SelectionBar"
import { docAbilities, docLevelOf, type DocLevel } from "@/lib/docs/abilities"
import type { ActionContext } from "@/components/docEditor/registry/types"

afterEach(cleanup)

const NEEDS = { summarize: "view", explain: "view", ask: "view", translate: "view", rewrite: "edit", write: "edit" }

/** A comment list as the server answers it now: the resolved level in the counts, the rest as the doc is. */
function answerFor(level: DocLevel, source: string): Record<string, unknown> {
    const rank = { none: 0, view: 1, comment: 2, edit: 3, full: 4 }[level]
    return {
        doc_uuid: "d",
        doc_read_access: rank >= 1 ? 1 : 0,
        doc_comment_access: rank >= 2 ? 1 : 0,
        doc_edit_access: rank >= 3 ? 1 : 0,
        doc_full_access: rank >= 4 ? 1 : 0,
        doc_created_by: { user_uuid: source === "author" ? ME : SOMEONE },
        doc_owner: source === "transfer" ? { user_uuid: ME } : undefined,
        doc_public_comment: false,
        doc_private: source !== "general",
        doc_comments: [],
    }
}

const EDITOR = { isActive: () => false, can: () => ({ undo: () => false, redo: () => false }), state: { selection: { empty: false } } } as unknown as ActionContext["editor"]

const MATRIX: Array<[string, DocLevel]> = [
    ["author", "full"],
    ["direct share", "view"], ["direct share", "comment"], ["direct share", "edit"], ["direct share", "full"],
    ["general", "view"], ["general", "comment"], ["general", "edit"],
    ["team", "view"], ["team", "comment"], ["team", "edit"],
    ["space", "view"], ["space", "comment"], ["space", "edit"],
    ["full access", "full"],
    ["transfer", "full"],
]

describe.each(MATRIX)("%s at %s", (source, level) => {
    const commentable = level !== "view"

    it(commentable ? "offers the comment box" : "says why there is no comment box", () => {
        answer = answerFor(level, source)
        answers.clear()
        const store = configureStore({ reducer: { threads: (st: Record<string, unknown> = {}) => st, createDocComment: (st: Record<string, unknown> = { docCommentCount: {} }) => st, ui: (st: Record<string, unknown> = {}) => st } })
        const { result } = renderHook(() => useDocThreads("d"), { wrapper: ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider> })
        expect(result.current.canComment).toBe(commentable)
        // Below comment, the panels say why (DocAccessNote, at this level).
        expect(result.current.level).toBe(level)
    })

    it("gets the selection bar's actions its level allows, and no others", () => {
        const abilities = docAbilities(docLevelOf(answerFor(level, source)), NEEDS)
        const ctx: ActionContext = { docId: "d", editor: EDITOR, canEdit: abilities.edit, abilities, bus: createDocCommandBus("d"), gate: { ai: false } }
        expect(readerOffers(ctx)).toBe(commentable)
        const labels = actionGroupsFor("selection", ctx, ["ai", "comment"], { disabled: "hide" }).flatMap((g) => g.actions.map((a) => a.label))
        expect(labels).not.toContain("Ask AI")
        if (commentable) expect(labels).toContain("Comment")
        else expect(labels).not.toContain("Comment")
        expect(abilities.share).toBe(level === "full")
    })
})
