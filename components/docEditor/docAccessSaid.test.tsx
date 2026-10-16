import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Docs incident, 14 Oct 2026 (D3, QA DSA-03): a doc someone can't change says
// what they may do, offers Request access only when a request would reach
// someone who can answer it, and its owner answers requests on the doc. The
// docs list marks what a person can only view. Ask AI offers a reader what
// reads the doc, never what changes it.

let fetched: Record<string, unknown> = {}
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (key: string) => ({ data: key ? fetched[key.split("?")[0].replace(/\/[0-9a-f-]{36}$/, "/:id")] : undefined, mutate: () => undefined }),
    useFetchOnlyOnce: (key: string) => ({ data: key ? { data: { doc_action_needs: { summarize: "view", explain: "view", ask: "view", rewrite: "edit", write: "edit", expand: "edit", fix_grammar: "edit", shorten: "edit" } } } : undefined }),
}))
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => true }))
const requestDocAccess = vi.fn(async () => ({}))
const answerDocAccess = vi.fn(async () => ({}))
vi.mock("@/lib/docs/accessRequests", () => ({
    docAccessKey: (id: string) => `/doc/access/${id}`,
    accessRequestsKey: (id: string) => `/doc/access/requests?doc_uuid=${id}`,
    requestAccess: (...a: unknown[]) => requestDocAccess(...(a as [])),
    answerRequest: (...a: unknown[]) => answerDocAccess(...(a as [])),
}))
vi.mock("@/services/aiService", () => ({
    useDocAI: () => ({ completeStream: vi.fn(), isStreaming: false, streamText: "", streamNotice: "", error: null, cancelStream: vi.fn(), resetResult: vi.fn() }),
}))
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useDispatch: () => vi.fn() }))
vi.mock("@/components/common/withFeature", () => ({ withAI: (c: unknown) => c }))

import { DocAccessNote } from "./DocAccessNote"
import { DocAccessRequests } from "./DocAccessRequests"
import { LevelMark } from "@/components/doc/LevelMark"

const DOC = "5c9b1e6d-e38a-4de8-84e8-4d628793c2cc"
afterEach(() => {
    cleanup()
    fetched = {}
    requestDocAccess.mockClear()
    answerDocAccess.mockClear()
})

describe("a doc someone can't change", () => {
    it("says what they may do, and offers Request access only when someone can answer", async () => {
        fetched = { "/doc/access/:id": { data: { level: "view", can_request: false } } }
        const { rerender } = render(<DocAccessNote docId={DOC} level="view" want="edit" />)
        expect(screen.getByRole("note").textContent).toBe("You can view this doc.")
        expect(screen.queryByRole("button")).toBeNull()
        fetched = { "/doc/access/:id": { data: { level: "comment", can_request: true } }, "/doc/access/requests": { data: { incoming: [], outgoing: [] } } }
        rerender(<DocAccessNote docId={DOC} level="comment" want="edit" />)
        fireEvent.click(screen.getByRole("button", { name: "Request edit access" }))
        await waitFor(() => expect(screen.getByText("Request sent")).toBeTruthy())
        expect(requestDocAccess).toHaveBeenCalledWith(DOC, "edit")
    })

    it("says a request is open rather than offering another", () => {
        fetched = {
            "/doc/access/:id": { data: { level: "view", can_request: true } },
            "/doc/access/requests": { data: { incoming: [], outgoing: [{ id: "r1", doc_uuid: DOC, status: "pending", level_wanted: "edit" }] } },
        }
        render(<DocAccessNote docId={DOC} level="view" want="edit" />)
        expect(screen.getByText("Request sent")).toBeTruthy()
        expect(screen.queryByRole("button")).toBeNull()
    })

    it("tells an admin that being one opens nothing", () => {
        fetched = { "/doc/access/:id": { data: { level: "view", can_request: false } } }
        render(<DocAccessNote docId={DOC} level="view" want="edit" admin />)
        expect(screen.getByRole("note").textContent).toContain("Being an admin doesn't open docs")
    })
})

describe("its owner", () => {
    it("answers the requests for it on the doc", async () => {
        fetched = {
            "/doc/access/requests": {
                data: {
                    incoming: [
                        { id: "r1", doc_uuid: DOC, status: "pending", level_wanted: "edit", requester: { user_uuid: "u1", user_name: "Ola" } },
                        { id: "r2", doc_uuid: "another-doc", status: "pending", level_wanted: "view", requester: { user_uuid: "u2", user_name: "Ben" } },
                    ],
                    outgoing: [],
                },
            },
        }
        render(<DocAccessRequests docId={DOC} />)
        expect(screen.getByText(/asked to edit this doc/).textContent).toContain("Ola")
        expect(screen.queryByText(/Ben/)).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Approve" }))
        await waitFor(() => expect(screen.queryByText(/Ola/)).toBeNull())
        expect(answerDocAccess).toHaveBeenCalledWith(expect.objectContaining({ id: "r1" }), { approve: true })
    })
})

describe("the docs list", () => {
    it("marks a doc someone can only view, or only comment on", () => {
        const { container, rerender } = render(<LevelMark level="view" />)
        expect(container.textContent).toBe("View only")
        rerender(<LevelMark level="comment" />)
        expect(container.textContent).toBe("Can comment")
        rerender(<LevelMark level="edit" />)
        expect(container.textContent).toBe("")
    })
})
