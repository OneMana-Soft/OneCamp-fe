import { describe, expect, it, vi } from "vitest"

import { heldOnServer, holdStore } from "@/lib/holdStore"

// One count of who holds something, shared by the connection pill's place
// (components/error/pillPlace) and the sheet progress bars (context/LoadingContext).
describe("a hold store", () => {
  it("is held while anyone holds it, and tells its listeners each time that changes", () => {
    const store = holdStore()
    const told = vi.fn()
    const stop = store.subscribe(told)
    expect(store.held()).toBe(false)
    const first = store.hold()
    const second = store.hold()
    expect(store.held()).toBe(true)
    first()
    expect(store.held()).toBe(true)
    second()
    expect(store.held()).toBe(false)
    expect(told).toHaveBeenCalledTimes(4)
    stop()
    store.hold()
    expect(told).toHaveBeenCalledTimes(4)
  })

  it("lets go once, however often a release is called", () => {
    const store = holdStore()
    const mine = store.hold()
    const theirs = store.hold()
    mine()
    mine()
    expect(store.held()).toBe(true)
    theirs()
    expect(store.held()).toBe(false)
  })

  it("keeps each store's count its own", () => {
    const a = holdStore()
    const b = holdStore()
    a.hold()
    expect([a.held(), b.held()]).toEqual([true, false])
  })

  it("is held by nobody on the server", () => {
    expect(heldOnServer()).toBe(false)
  })
})
