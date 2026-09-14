import { afterEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"

import {
    SIDEBAR_SECTIONS_COOKIE,
    readSidebarSections,
    useSidebarDisclosure,
    writeSidebarSection,
} from "@/lib/nav/sidebarDisclosure"

function clearCookie() {
    document.cookie = `${SIDEBAR_SECTIONS_COOKIE}=; path=/; max-age=0`
}

afterEach(clearCookie)

describe("remembered sidebar sections", () => {
    it("starts empty", () => {
        expect(readSidebarSections()).toEqual({})
    })

    it("round-trips one section", () => {
        writeSidebarSection("more", true)
        expect(readSidebarSections()).toEqual({ more: true })
    })

    // One cookie holds every section, so a write has to merge rather than
    // replace, or opening Docs would forget that More was open.
    it("keeps the sections it is not writing", () => {
        writeSidebarSection("more", true)
        writeSidebarSection("docs", false)
        expect(readSidebarSections()).toEqual({ more: true, docs: false })
    })

    it("survives a cookie somebody mangled", () => {
        document.cookie = `${SIDEBAR_SECTIONS_COOKIE}=not-json; path=/`
        expect(readSidebarSections()).toEqual({})
    })

    it("ignores values that are not open/closed", () => {
        document.cookie = `${SIDEBAR_SECTIONS_COOKIE}=${encodeURIComponent(
            JSON.stringify({ more: true, docs: "yes", boards: 1 }),
        )}; path=/`
        expect(readSidebarSections()).toEqual({ more: true })
    })
})

describe("useSidebarDisclosure", () => {
    it("uses the default when nothing is remembered", () => {
        const { result } = renderHook(() => useSidebarDisclosure("more", false))
        expect(result.current[0]).toBe(false)
    })

    // The first paint is server-rendered, so the stored value can only be
    // applied after mount. What matters is that it is applied at all.
    it("adopts what was remembered", () => {
        writeSidebarSection("more", true)
        const { result } = renderHook(() => useSidebarDisclosure("more", false))
        expect(result.current[0]).toBe(true)
    })

    it("remembers the next change", () => {
        const { result } = renderHook(() => useSidebarDisclosure("more", false))
        act(() => result.current[1](true))
        expect(result.current[0]).toBe(true)
        expect(readSidebarSections()).toEqual({ more: true })
    })

    it("does not confuse one section with another", () => {
        writeSidebarSection("docs", true)
        const { result } = renderHook(() => useSidebarDisclosure("more", false))
        expect(result.current[0]).toBe(false)
    })
})
