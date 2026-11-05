import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import * as Y from "yjs"
import { PRIVATE_KEY, privateNotesKey, privateViews, usePrivateMode } from "./privateMode"

// Private mode's gate (miro-25): the board's first load carries only this. Its code comes once a round runs or the
// browser kept a round's notes, and until it has, a running round holds the frame's write.

const KEY = privateNotesKey("b1", "u-sam")
const ROUND = { id: "r1", byId: "u-ann", byName: "Ann", startedAt: 1 }

afterEach(() => window.localStorage.clear())

describe("private mode's gate", () => {
  it("wants nothing on a board with no round and nothing kept, and holds nothing", () => {
    const doc = new Y.Doc()
    const { result } = renderHook(() => usePrivateMode(doc, KEY, { current: null }))
    expect(result.current.wanted).toBe(false)
    expect(result.current.holds()).toBe(false)
  })

  it("wants the code from the moment a round starts, and holds the write until it has come", () => {
    const doc = new Y.Doc()
    const loaded: { current: unknown } = { current: null }
    const { result } = renderHook(() => usePrivateMode(doc, KEY, loaded))
    act(() => doc.getMap("facilitation").set(PRIVATE_KEY, ROUND))
    expect(result.current.wanted).toBe(true)
    expect(result.current.holds()).toBe(true)
    loaded.current = {}
    expect(result.current.holds()).toBe(false)
  })

  it("holds from the round's first frame, before any render has seen it", () => {
    const doc = new Y.Doc()
    const { result } = renderHook(() => usePrivateMode(doc, KEY, { current: null }))
    const holds = result.current.holds
    doc.getMap("facilitation").set(PRIVATE_KEY, ROUND)
    expect(holds()).toBe(true)
  })

  it("wants the code at once when this browser kept a round's notes, so a reload gets its words back", () => {
    window.localStorage.setItem(KEY, "{}")
    const { result } = renderHook(() => usePrivateMode(new Y.Doc(), KEY, { current: null }))
    expect(result.current.wanted).toBe(true)
    expect(result.current.holds()).toBe(false)
  })

  it("keeps wanting it after the round ends, so the reveal and the next round need no second load", () => {
    const doc = new Y.Doc()
    const { result } = renderHook(() => usePrivateMode(doc, KEY, { current: null }))
    act(() => doc.getMap("facilitation").set(PRIVATE_KEY, ROUND))
    act(() => doc.getMap("facilitation").delete(PRIVATE_KEY))
    expect(result.current.wanted).toBe(true)
    expect(result.current.holds()).toBe(false)
  })

  it("names its canvas's gate and handle by the scene's api, for every path that sends the scene (lib/board/sceneOut)", () => {
    const doc = new Y.Doc()
    const loaded: { current: unknown } = { current: null }
    const api = {}
    renderHook(() => usePrivateMode(doc, KEY, loaded, api))
    const view = privateViews.get(api)!
    expect(view.handle).toBe(loaded)
    expect(view.holds()).toBe(false)
    act(() => doc.getMap("facilitation").set(PRIVATE_KEY, ROUND))
    expect(view.holds()).toBe(true)
    loaded.current = {}
    expect(view.holds()).toBe(false)
  })

  it("keys a person's kept notes by board and person", () => {
    expect(privateNotesKey("b1", "u-sam")).not.toBe(privateNotesKey("b2", "u-sam"))
    expect(privateNotesKey("b1", "u-sam")).not.toBe(privateNotesKey("b1", "u-ann"))
  })
})
