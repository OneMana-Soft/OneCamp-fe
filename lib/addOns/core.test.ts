import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"

// An edition gives each shared surface one add-on (lib/addOns/core). A second
// for the same surface is a mistake two packages made, so it throws rather
// than replacing the first. Each case loads its own copy of the module, since
// what an edition gave is held for the app's life.
beforeEach(() => {
  vi.resetModules()
})

describe("an edition's add-ons", () => {
  it("take one per surface: a second for the same surface throws, the first stays, and another surface takes its own", async () => {
    const { provideAddOns, useMessageAddOn, useAttachmentAddOn } = await import("@/lib/addOns/core")
    provideAddOns({ useMessage: (text) => ({ actions: [], below: `first: ${text}` }) })

    expect(() => provideAddOns({ useMessage: () => ({ actions: [], below: "second" }) })).toThrow("useMessage is given twice")
    expect(renderHook(() => useMessageAddOn("hi")).result.current.below).toBe("first: hi")

    provideAddOns({ useAttachment: () => ({ actions: [], note: { title: "Found", text: "A floor plan." } }) })
    expect(renderHook(() => useAttachmentAddOn(undefined, true, undefined)).result.current.note?.title).toBe("Found")
  })
})
