import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

import { MediaQueryProvider } from "@/context/MediaQueryContext"
import { docLoadFailure } from "@/components/docEditor/docLoadFailure"

// small-details E3: with no network, or the server down, a doc said "This doc
// isn't available. It may have been deleted". The real DocView, its fetch
// answering as axios fails.

const fetched: { data?: unknown; isError?: unknown } = {}
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
    useFetch: () => ({ ...fetched, isLoading: false, mutate }),
    useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u-sam", user_name: "Sam Rivera" } }, isLoading: false }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => ({})), isSubmitting: false }) }))
// The page opens the comments page on a phone or tablet (router.push).
vi.mock("next/navigation", () => {
  // One router, as Next gives: a new one per render would change the page's callbacks.
  const router = { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }
  return { useRouter: () => router, usePathname: () => "/app/doc/d1", useSearchParams: () => new URLSearchParams() }
})
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: () => ({ isConnected: false }) }))
vi.mock("@/hooks/useDocSession", () => ({
    useDocSession: () => ({
        provider: null, status: "disconnected", synced: false, activeUsers: 0, awarenessUsers: [],
        access: { level: "none", canEdit: false, locked: false }, lineage: null, schemaVersion: null, persistedAt: null,
        openError: null, refused: null, legacy: false, recovered: null, dismissRecovered: () => {}, retry: () => {},
    }),
}))
vi.mock("@/lib/collabToken", () => ({ warmCollabToken: () => undefined }))
// The page reads the AI gate from /config/client; a test that waits lets it ask.
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))
vi.mock("@/components/docEditor/docInput", () => ({ default: () => null }))
vi.mock("@/components/docEditor/DocHeader", () => ({ DocHeader: () => null, DocShortcutsDialog: () => null }))
vi.mock("@/components/entityLink/LinkedFromSection", () => ({ LinkedFromSection: () => null }))

import { DocView } from "./DocView"

afterEach(() => {
    cleanup()
    mutate.mockReset()
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true })
})

const failed = (status?: number, data?: Record<string, unknown>) => Object.assign(new Error(status ? `Request failed with status code ${status}` : "Network Error"), status ? { response: { status, data } } : {})

function renderDoc(error: unknown) {
    fetched.data = undefined
    fetched.isError = error
    const store = configureStore({ reducer: { createDocComment: (s = { docCommentCount: {} }) => s, ui: (s: Record<string, unknown> = {}) => s } })
    render(
        <Provider store={store}>
            <MediaQueryProvider>
                <DocView docId="d1" />
            </MediaQueryProvider>
        </Provider>,
    )
}

describe("a doc that didn't open", () => {
    it("says the server can't be reached when nothing answered, and tries again", () => {
        renderDoc(failed())
        expect(screen.getByRole("heading", { name: "Can't reach the server" })).toBeTruthy()
        expect(screen.queryByText(/deleted/)).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
        expect(mutate).toHaveBeenCalledTimes(1)
    })

    it("says so when the browser is offline", () => {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })
        renderDoc(failed())
        expect(screen.getByRole("heading", { name: "You're offline" })).toBeTruthy()
    })

    it("says the same for a server error", () => {
        renderDoc(failed(503))
        expect(screen.getByRole("heading", { name: "Can't reach the server" })).toBeTruthy()
    })

    it("says a doc that's gone doesn't exist", () => {
        for (const status of [400, 404]) {
            renderDoc(failed(status))
            expect(screen.getByRole("heading", { name: "This doc doesn't exist or was deleted" })).toBeTruthy()
            expect(screen.getByRole("link", { name: "Back to docs" })).toBeTruthy()
            cleanup()
        }
    })

    // QA DSA-03, docs incident 14 Oct 2026: B6's page, in the shared frame,
    // offers Request access only when a request would reach someone.
    it("says a doc that isn't shared with them can't be seen, with Request access when someone can answer", async () => {
        renderDoc(failed(403))
        expect(await screen.findByRole("heading", { name: "You can't see this doc" }, { timeout: 5000 })).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Request access" })).toBeNull()
        cleanup()
        renderDoc(failed(403, { can_request: true }))
        expect(await screen.findByRole("button", { name: "Request access" }, { timeout: 5000 })).toBeTruthy()
    })
})

describe("docLoadFailure", () => {
    it("reads axios's errors", () => {
        expect(docLoadFailure(failed())).toBe("unreachable")
        expect(docLoadFailure(failed(500))).toBe("unreachable")
        expect(docLoadFailure(failed(502))).toBe("unreachable")
        expect(docLoadFailure(failed(400))).toBe("gone")
        expect(docLoadFailure(failed(403))).toBe("gone")
        expect(docLoadFailure(failed(404))).toBe("gone")
    })
})
