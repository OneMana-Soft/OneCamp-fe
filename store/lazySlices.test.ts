import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { createSlice } from "@reduxjs/toolkit"

import store, { INJECT_SLICE_ACTION, RESET_STORE_ACTION, STATIC_SLICE_NAMES, injectSlice } from "@/store/store"
import { openUI } from "@/store/slice/uiSlice"

// A doc's state (its comments, A8's threads) is added by the doc's pages when
// they load, not with the store: every page reaches the store, and a doc-only
// slice in its static list rode into every first load (app/firstLoad.test.ts
// holds a project's first screen under a ceiling it pushed past).
const DOC_ONLY = /doc|thread/i

describe("the store's static slices", () => {
    it("hold no doc-only slice", () => {
        expect(STATIC_SLICE_NAMES.filter((name) => DOC_ONLY.test(name))).toEqual([])
    })

    it("and the store imports none", () => {
        const src = readFileSync("store/store.ts", "utf8")
        const imported = [...src.matchAll(/^\s*import\s+(?!type\b)[^'";]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1])
        expect(imported.filter((spec) => /slice\//.test(spec) && DOC_ONLY.test(spec))).toEqual([])
    })

    // B7: a doc's comments are its threads (below); the count its header and
    // the phone's bar show is what is left of the comment store.
    it("leave a doc's comment count to the pages that show it", () => {
        expect(store.getState().createDocComment).toBeUndefined()
        for (const page of ["components/views/DocView.tsx", "components/docComments/useDocThreads.ts"]) {
            expect(readFileSync(page, "utf8"), page).toMatch(/^injectSlice\(createDocCommentSlice\);?$/m)
        }
    })

    it("leave A8's threads to the threads UI", () => {
        expect(store.getState().threads).toBeUndefined()
        expect(readFileSync("components/threads/useThreads.ts", "utf8")).toMatch(/^injectSlice\(threadsSlice\);?$/m)
    })
})

describe("a slice a page adds (injectSlice)", () => {
    const probe = createSlice({
        name: "lazyProbe",
        initialState: { opened: 0 },
        reducers: {
            opened: (s) => {
                s.opened += 1
            },
        },
    })
    type Probed = { lazyProbe?: { opened: number } }
    const probed = () => (store.getState() as Probed).lazyProbe

    it("has its state at once", () => {
        expect(probed()).toBeUndefined()
        injectSlice(probe)
        expect(probed()).toEqual({ opened: 0 })
        store.dispatch(probe.actions.opened())
        expect(probed()).toEqual({ opened: 1 })
    })

    it("is added once: adding it again changes nothing", () => {
        const before = store.getState()
        injectSlice(probe)
        expect(store.getState()).toBe(before)
    })

    it("keeps the state object when no slice handles an action", () => {
        const before = store.getState()
        store.dispatch({ type: "nothing/handlesThis" })
        store.dispatch({ type: INJECT_SLICE_ACTION, payload: { name: "lazyProbe" } })
        expect(store.getState()).toBe(before)
    })

    it("changes only its own state for its own action", () => {
        const before = store.getState()
        store.dispatch(probe.actions.opened())
        expect(store.getState().ui).toBe(before.ui)
        expect(probed()).not.toBe((before as Probed).lazyProbe)
    })

    it("starts again on a reset, like every other slice", () => {
        store.dispatch(openUI({ key: "channelFileUpload" }))
        store.dispatch({ type: RESET_STORE_ACTION })
        expect(probed()).toEqual({ opened: 0 })
    })

    it("never replaces a static slice", () => {
        const before = store.getState()
        injectSlice({ name: "ui", reducer: () => ({ hijacked: true }) })
        store.dispatch({ type: "nothing/handlesThis" })
        expect(store.getState()).toBe(before)
        expect(store.getState().ui).not.toEqual({ hijacked: true })
    })
})
