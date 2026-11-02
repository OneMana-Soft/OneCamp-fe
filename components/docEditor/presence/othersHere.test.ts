import { afterEach, describe, expect, it } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import { othersOn, useOthersHere } from "./othersHere"

// Someone else on a document (V-286): any tab but this one, named or not. A share link's guest says nothing of
// themselves and the collaboration service passes their tab on as an empty state, so the list of who's here never
// names them; a board's Bring everyone here still has someone to bring.

/** An awareness as y-protocols keeps it: each tab's state by client, and a change heard on every join, say or leave. */
function awarenessFor(self: number) {
  const states = new Map<number, Record<string, unknown>>([[self, { user: { id: "u-sam", name: "Sam Rivera" } }]])
  const heard = new Set<() => void>()
  const tell = () => act(() => heard.forEach((l) => l()))
  return {
    awareness: {
      clientID: self,
      getStates: () => states,
      on: (_: "change", l: () => void) => void heard.add(l),
      off: (_: "change", l: () => void) => void heard.delete(l),
    },
    say(client: number, state: Record<string, unknown>) {
      states.set(client, state)
      tell()
    },
    leave(client: number) {
      states.delete(client)
      tell()
    },
    listening: () => heard.size,
  }
}

afterEach(cleanup)

describe("someone else here", () => {
  it("is no one while this tab is alone, and anyone on the document once they come: a member, or a link's guest who says nothing", () => {
    const a = awarenessFor(1)
    const { result } = renderHook(() => useOthersHere(a.awareness))
    expect(result.current).toBe(false)
    // A share link's guest: the service passes their tab on as {}.
    a.say(5, {})
    expect(result.current).toBe(true)
    a.say(7, { user: { id: "u-ann", name: "Ann Lee" } })
    a.leave(5)
    expect(result.current, "Ann is still here").toBe(true)
    a.leave(7)
    expect(result.current).toBe(false)
  })

  it("answers again only when the answer changes, and stops listening when it goes", () => {
    const a = awarenessFor(1)
    let renders = 0
    const { unmount } = renderHook(() => {
      renders++
      return useOthersHere(a.awareness)
    })
    a.say(7, { user: { id: "u-ann", name: "Ann Lee" } })
    const after = renders
    // Ann's pointer moving, and this tab saying something of its own, change nothing here.
    a.say(7, { user: { id: "u-ann", name: "Ann Lee" }, pointer: { x: 1, y: 2 } })
    a.say(1, { user: { id: "u-sam", name: "Sam Rivera" }, idle: true })
    expect(renders).toBe(after)
    unmount()
    expect(a.listening()).toBe(0)
  })

  it("is no one without an awareness, and is read from the states alone", () => {
    expect(renderHook(() => useOthersHere(null)).result.current).toBe(false)
    expect(othersOn(new Map([[1, {}]]), 1)).toBe(false)
    expect(othersOn(new Map([[1, {}], [4, {}]]), 1)).toBe(true)
    expect(othersOn(new Map(), 1)).toBe(false)
  })
})
