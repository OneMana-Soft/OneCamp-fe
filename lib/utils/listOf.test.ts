import { describe, expect, it } from "vitest"
import { listOf, listOnceRead } from "@/lib/utils/listOf"

type Answer = { data: { items: string[] | null } | null }

describe("a list as a screen reads it (V-51, V-52)", () => {
  const pick = (a: Answer) => a.data?.items

  it("is undefined while the answer hasn't come, so only that draws loading rows", () => {
    expect(listOnceRead<Answer, string>(undefined, pick)).toBeUndefined()
  })

  it("is [] for none, however the server wrote it", () => {
    expect(listOnceRead<Answer, string>({ data: { items: null } }, pick)).toEqual([])
    expect(listOnceRead<Answer, string>({ data: null }, pick)).toEqual([])
    expect(listOnceRead<Answer, string>({ data: { items: [] } }, pick)).toEqual([])
  })

  it("is the answer's own list when there is one", () => {
    const items = ["Beta", "Launch"]
    expect(listOnceRead<Answer, string>({ data: { items } }, pick)).toBe(items)
  })

  it("gives one empty list for every none, so effects that depend on it stay still", () => {
    const a = listOnceRead<Answer, string>({ data: { items: null } }, pick)
    const b = listOnceRead<Answer, string>({ data: null }, pick)
    expect(a).toBe(b)
    expect(Object.isFrozen(a)).toBe(true)
  })

  it("listOf: an answer's list, or none when it isn't one", () => {
    expect(listOf<number>([1])).toEqual([1])
    expect(listOf<number>(null)).toEqual([])
    expect(listOf<number>({})).toEqual([])
  })
})
