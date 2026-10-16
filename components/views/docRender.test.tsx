import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { MediaQueryProvider } from "@/context/MediaQueryContext"

// Render cost (docs frontend analysis): every caret move of a collaborator
// (awareness), every key typed in the title and every MQTT message rendered
// the doc page and its editor again. The real DocView, with its editor
// replaced by a memoised counter that stands where the memoised editor does.

const counts = { body: 0 }
let bodyProps: Record<string, unknown> = {}
vi.mock("@/components/docEditor/docInput", () => ({
    default: React.memo(function Body(props: Record<string, unknown>) {
        counts.body++
        bodyProps = props
        return <div data-testid="body" />
    }),
}))
vi.mock("@/components/docEditor/DocHeader", () => ({
    DocHeader: ({ title }: { title: string }) => <nav data-testid="header">{title}</nav>,
    DocShortcutsDialog: () => null,
}))
vi.mock("@/components/entityLink/LinkedFromSection", () => ({ LinkedFromSection: () => null }))

const doc = {
    doc_uuid: "d1",
    doc_title: "Launch sync notes",
    doc_body: "<p>hello</p>",
    doc_edit_access: 1,
    doc_created_by: { user_uuid: "u-sam", user_name: "Sam Rivera" },
    doc_mqtt_topic: "doc/d1",
    doc_comment_count: 0,
    doc_created_at: "2026-10-01T00:00:00Z",
    doc_updated_at: "2026-10-02T00:00:00Z",
}
const docAnswer = { data: doc }
const me = { data: { user_uuid: "u-sam", user_name: "Sam Rivera" } }
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ data: docAnswer, isLoading: false, mutate: vi.fn() }),
    useFetchOnlyOnce: () => ({ data: me }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: postRequest, isSubmitting: false }) }))
// The page opens the comments page on a phone or tablet (router.push).
vi.mock("next/navigation", () => {
  // One router, as Next gives: a new one per render would change the page's callbacks.
  const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }
  return { useRouter: () => router, usePathname: () => "/app/doc/d1", useSearchParams: () => new URLSearchParams() }
})
const postRequest = vi.fn(async () => ({}))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => ({ isConnected: true }) }))
vi.mock("@/lib/collabToken", () => ({ warmCollabToken: () => undefined }))

// The doc's session (hooks/useDocSession), driven by the test: presence
// changes as people move.
type Collab = { provider: object; status: string; synced: boolean; activeUsers: number; awarenessUsers: Array<{ id: string; name: string }> }
const fakeProvider = { on: vi.fn(), off: vi.fn(), unsyncedChanges: 0, document: { on: vi.fn(), off: vi.fn() } }
let collab: Collab = { provider: fakeProvider, status: "connected", synced: true, activeUsers: 2, awarenessUsers: [{ id: "u-sam", name: "Sam Rivera" }, { id: "u-kim", name: "Kim Lee" }] }
const listeners = new Set<() => void>()
const setCollab = (next: Partial<Collab>) => {
    collab = { ...collab, ...next }
    listeners.forEach((l) => l())
}
let sessionInput: { user?: { id?: string } } | undefined
const EDITS = { level: "full", canEdit: true, locked: false }
const noop = () => {}
vi.mock("@/hooks/useDocSession", () => ({
    useDocSession: (input?: { user?: { id?: string } }) => {
        sessionInput = input
        const c = React.useSyncExternalStore(
            (l) => {
                listeners.add(l)
                return () => listeners.delete(l)
            },
            () => collab,
        )
        return { ...c, access: EDITS, lineage: null, schemaVersion: null, persistedAt: null, openError: null, refused: null, legacy: false, recovered: null, dismissRecovered: noop, retry: noop }
    },
}))

import { DocView } from "./DocView"

afterEach(cleanup)

function renderDoc() {
    const store = configureStore({
        reducer: {
            createDocComment: (s = { docCommentCount: {} }) => s,
            ui: (s: Record<string, unknown> = {}) => s,
            rightPanel: (s = { rightPanelState: { data: {} } }) => s,
        },
    })
    render(
        <Provider store={store}>
            <MediaQueryProvider>
                <DocView docId="d1" />
            </MediaQueryProvider>
        </Provider>,
    )
}

describe("the doc page", () => {
    it("doesn't render its editor again when someone moves their caret", () => {
        renderDoc()
        const settled = counts.body
        expect(settled).toBeGreaterThan(0)
        for (let i = 0; i < 5; i++) {
            act(() => setCollab({ awarenessUsers: [{ id: "u-sam", name: "Sam Rivera" }, { id: "u-kim", name: "Kim Lee" }] }))
        }
        expect(counts.body).toBe(settled)
    })

    it("renders the title alone as it's typed, and the breadcrumb follows", () => {
        renderDoc()
        const settled = counts.body
        const type = bodyProps.onTitleChange as (t: string) => void
        act(() => type("Launch sync"))
        act(() => type("Launch sync notes v2"))
        expect(counts.body).toBe(settled)
        expect((bodyProps.titleStore as { get: () => string }).get()).toBe("Launch sync notes v2")
    })

    it("is memoised where the page uses it", async () => {
        const actual = await vi.importActual<{ default: { $$typeof: symbol } }>("@/components/docEditor/docInput")
        expect(actual.default.$$typeof).toBe(Symbol.for("react.memo"))
    }, 60_000)
})

// D-6: "Untitled" is only the title's placeholder. A doc made with no title
// opened with the word itself in its title, so leaving the doc saved it as
// the doc's name, and a blank title was saved as "Untitled" too.
describe("a doc with no title", () => {
    const titlesSaved = () =>
        (postRequest.mock.calls as unknown as Array<[{ payload?: { doc_title?: string } }]>)
            .map(([req]) => req?.payload?.doc_title)
            .filter((t) => t !== undefined)

    it("starts with an empty title, and saves a title only once one is typed", async () => {
        const before = doc.doc_title
        doc.doc_title = ""
        try {
            postRequest.mockClear()
            renderDoc()
            const titleStore = bodyProps.titleStore as { get: () => string }
            const type = bodyProps.onTitleChange as (t: string) => void
            const blur = bodyProps.onTitleBlur as () => void
            expect(titleStore.get()).toBe("")
            act(() => blur())
            act(() => type("   "))
            act(() => blur())
            expect(titlesSaved()).toEqual([])
            act(() => type("Launch plan"))
            await act(async () => blur())
            expect(titlesSaved()).toEqual(["Launch plan"])
        } finally {
            doc.doc_title = before
        }
    })

    it("keeps a doc's title when it's cleared and left blank", () => {
        postRequest.mockClear()
        renderDoc()
        act(() => (bodyProps.onTitleChange as (t: string) => void)(""))
        act(() => (bodyProps.onTitleBlur as () => void)())
        expect(titlesSaved()).toEqual([])
    })
})

describe("this person, to the doc's other tabs", () => {
    it("is drawn in their avatar's hue, by display name", async () => {
        renderDoc()
        const { identityHue } = await import("@/lib/identityHue")
        // The editor's caret carries it to the other tabs (blocks/behaviour.ts);
        // the session connects as this person.
        expect((bodyProps.collaboration as { hue?: string } | undefined)?.hue).toBe(identityHue({ name: "Sam Rivera", id: "u-sam" }))
        expect(sessionInput?.user?.id).toBe("u-sam")
    })
})

describe("presence from the provider", () => {
    it("keeps the same list while the same people are here", async () => {
        const { samePeople } = await vi.importActual<typeof import("@/hooks/useCollaborationProvider")>("@/hooks/useCollaborationProvider")
        const a = [{ id: "1", name: "Sam", color: "#000" }]
        expect(samePeople(a, [{ id: "1", name: "Sam", color: "#000" }])).toBe(true)
        expect(samePeople(a, [{ id: "2", name: "Kim", color: "#000" }])).toBe(false)
        expect(samePeople(a, [])).toBe(false)
    })
})
