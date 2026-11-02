import { describe, expect, it } from "vitest"
import { renderHook } from "@testing-library/react"
import { useAtFirstSync } from "./firstSync"

// What was on a collaboration as this tab came: read at the first sync, when the server has sent who is already there.
describe("useAtFirstSync", () => {
  const awarenessWith = (people: string[]) => ({ people })
  const read = (a: { people: string[] }) => [...a.people]

  it("is null until the first sync, then what the awareness held at it, kept through later changes and a reconnect", () => {
    const a = awarenessWith([])
    const { result, rerender } = renderHook(({ synced }) => useAtFirstSync(a, synced, read), { initialProps: { synced: false } })
    expect(result.current, "drawn before the sync: who is there hasn't come yet").toBeNull()
    a.people.push("ann", "vic")
    rerender({ synced: true })
    expect(result.current).toEqual(["ann", "vic"])
    const first = result.current
    a.people.push("kim")
    rerender({ synced: true })
    rerender({ synced: false })
    rerender({ synced: true })
    expect(result.current, "the same reading, kept").toBe(first)
  })

  it("takes another awareness's own at its first sync, and is null with none", () => {
    const one = awarenessWith(["ann"])
    const two = awarenessWith(["vic"])
    const { result, rerender } = renderHook(({ on, synced }) => useAtFirstSync(on, synced, read), {
      initialProps: { on: one as { people: string[] } | null, synced: true },
    })
    expect(result.current).toEqual(["ann"])
    rerender({ on: two, synced: false })
    expect(result.current, "a new provider's awareness, not yet synced").toBeNull()
    rerender({ on: two, synced: true })
    expect(result.current).toEqual(["vic"])
    rerender({ on: null, synced: true })
    expect(result.current).toBeNull()
  })
})
