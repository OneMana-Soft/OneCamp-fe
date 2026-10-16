import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Provider } from "react-redux"
import { configureStore } from "@reduxjs/toolkit"

// The phone's doc bar decided "owner" with undefined == undefined, so while
// the doc or the profile was loading (or for a doc without a creator) every
// reader was offered Delete.

const answers: Record<string, unknown> = {}
vi.mock("@/hooks/useFetch", () => ({
    useFetch: (url: string) => ({ data: answers[url.split("/").slice(0, -1).join("/")] }),
    useFetchOnlyOnce: () => ({ data: answers.self }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn() }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { MobileTopNavigationBarThirdDoc } from "./mobileTopNavigationBarThirdDoc"

afterEach(cleanup)

function openOptions() {
    cleanup()
    const actions: Array<{ type: string; payload?: { key?: string; data?: { isOwner?: boolean } } }> = []
    const store = configureStore({ reducer: { createDocComment: (s = { docCommentCount: {} }) => s } })
    const dispatch = store.dispatch
    store.dispatch = ((a: never) => {
        actions.push(a)
        return dispatch(a)
    }) as typeof store.dispatch
    render(<Provider store={store}><MobileTopNavigationBarThirdDoc docId="d1" /></Provider>)
    fireEvent.click(screen.getByRole("button", { name: "Document options" }))
    return actions.find((a) => a.payload?.key === "docOptionsDrawer")?.payload?.data?.isOwner
}

describe("the phone doc bar", () => {
    it("isn't the owner's while neither the doc nor the profile has loaded", () => {
        expect(openOptions()).toBe(false)
    })

    it("is the owner's when the profile is the doc's creator", () => {
        answers["/doc/getDocInfo"] = { data: { doc_created_by: { user_uuid: "u-sam" } } }
        answers.self = { data: { user_uuid: "u-sam" } }
        expect(openOptions()).toBe(true)
        answers.self = { data: { user_uuid: "u-kim" } }
        expect(openOptions()).toBe(false)
    })
})
