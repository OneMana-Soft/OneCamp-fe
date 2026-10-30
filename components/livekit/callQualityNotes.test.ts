import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const answer = vi.hoisted(() => ({ value: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: answer.value }) }))

import { qualityKey, qualityNote, useQualityVerdicts } from "./callQualityNotes"

// Why a call stutters for someone, in People's words (calls A5, #56): only
// what's worth saying, and only for whoever runs the call.
describe("a person's call quality, in words", () => {
  it("names their network, their computer, or video freezing on its way to them; nothing when fine or unknown", () => {
    expect(qualityNote("network")?.label).toBe("Weak connection")
    expect(qualityNote("cpu")?.label).toBe("Computer struggling")
    expect(qualityNote("other_side")?.label).toBe("Video freezing")
    expect(qualityNote("other_side")?.detail).toMatch(/fine/)
    expect(qualityNote("fine")).toBeNull()
    expect(qualityNote("unknown")).toBeNull()
    expect(qualityNote(undefined)).toBeNull()
  })

  it("is read only while People is open, for someone who runs the call", () => {
    expect(qualityKey("s 1", true, true)).toBe("/calls/s%201/quality")
    expect(qualityKey("s1", false, true)).toBe("")
    expect(qualityKey("s1", true, false)).toBe("")
    expect(qualityKey(undefined, true, true)).toBe("")
  })
})

describe("each person's verdict, read while People is open", () => {
  it("comes from the server's list, by who they are in the call", () => {
    answer.value = { data: [{ identity: "maya", verdict: "network" }, { identity: "kai", verdict: "fine" }] }
    const { result } = renderHook(() => useQualityVerdicts("/calls/s1/quality"))
    expect([...result.current]).toEqual([["maya", "network"], ["kai", "fine"]])
  })

  // A fake server's catch-all answered {data: {}} (the 20 Oct shooters), and
  // reading it as a list threw: the whole call page went down when People
  // opened. An answer that isn't a list says nothing about anyone.
  it("is nobody's, and never throws, when the answer isn't a list", () => {
    for (const value of [{ data: {} }, { data: null }, { data: "busy" }, {}, undefined]) {
      answer.value = value
      const { result } = renderHook(() => useQualityVerdicts("/calls/s1/quality"))
      expect(result.current.size).toBe(0)
    }
  })
})
