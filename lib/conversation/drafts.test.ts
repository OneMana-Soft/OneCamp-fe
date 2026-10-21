import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { draftKeyOf, draftPlaceOf, draftSignature, fromServerDraft, isBlankDraft, toServerDraft, type KeptDraft } from "./drafts"

pinTestClock()

// The shapes and rules the Draft Store and the server share (chat P5).

const ME = "0c4a0000-0000-4000-8000-00000000000a"
const MAYA = "0c4a0000-0000-4000-8000-00000000000b"
const file = { attachment_uuid: "f1", attachment_obj_key: "k1", attachment_file_name: "plan.pdf", attachment_type: "document", attachment_size: 10, attachment_created_at: "" } as never

describe("a draft", () => {
  it("is blank with no words, picture, file or reply", () => {
    for (const html of ["", "<p></p>", "<p><br></p>", "<p>&nbsp; </p><p></p>"]) expect(isBlankDraft({ html, files: [] })).toBe(true)
    expect(isBlankDraft(null)).toBe(true)
    expect(isBlankDraft({ html: "<p>Ship it</p>", files: [] })).toBe(false)
    expect(isBlankDraft({ html: '<p><img src="a.png"></p>', files: [] })).toBe(false)
    expect(isBlankDraft({ html: "", files: [file] })).toBe(false)
    expect(isBlankDraft({ html: "", files: [], replyTo: { uuid: "m1" } })).toBe(false)
  })

  it("says the same for the same draft, and nothing for any blank one", () => {
    const a: KeptDraft = { html: "<p>Ship it</p>", files: [file], replyTo: { uuid: "m1", authorName: "Maya" } }
    expect(draftSignature(a)).toBe(draftSignature({ ...a, replyTo: { uuid: "m1", authorName: "Maya", text: "changed preview" } }))
    expect(draftSignature(a)).not.toBe(draftSignature({ ...a, html: "<p>Ship it!</p>" }))
    expect(draftSignature(a)).not.toBe(draftSignature({ ...a, alsoSend: true }))
    expect(draftSignature({ html: "<p></p>", files: [] })).toBe("")
    expect(draftSignature(undefined)).toBe("")
  })

  it("goes to the server and comes back as it was", () => {
    const a: KeptDraft = { html: "<p>Ship it</p>", files: [file], replyTo: { uuid: "m1", authorName: "Maya", text: "Ready?" }, alsoSend: true }
    const body = toServerDraft("post-thread:r1", a)
    expect(body).toEqual({ key: "post-thread:r1", html: "<p>Ship it</p>", files: [file], reply_to: { uuid: "m1", author_name: "Maya", text: "Ready?" }, also_send: true })
    expect(fromServerDraft({ ...body, updated_at: "2026-10-17T09:00:00Z" })).toEqual(a)
    expect(fromServerDraft({ key: "channel:c", html: "<p>a</p>", updated_at: "" })).toEqual({ html: "<p>a</p>", files: [] })
  })
})

describe("a draft's key", () => {
  it("names each composer as the server does, and back", () => {
    const places = [
      ["channel", "c0ffee00-0000-4000-8000-000000000001", "channel:c0ffee00-0000-4000-8000-000000000001"],
      ["group", "9f86d081", "group:9f86d081"],
      ["post-thread", "r1", "post-thread:r1"],
      ["chat-thread", "r2", "chat-thread:r2"],
    ] as const
    for (const [place, id, key] of places) {
      expect(draftKeyOf(place, id, ME)).toBe(key)
      expect(draftPlaceOf(key, ME)).toEqual({ place, id })
    }
  })

  it("names a DM by both people, and gives back the other one", () => {
    const key = draftKeyOf("dm", MAYA, ME)!
    expect(key).toBe(`dm:${ME} ${MAYA}`)
    expect(draftPlaceOf(key, ME)).toEqual({ place: "dm", id: MAYA })
    expect(draftPlaceOf(key, MAYA)).toEqual({ place: "dm", id: ME })
    // Notes to yourself are a DM with yourself.
    expect(draftPlaceOf(`dm:${ME} ${ME}`, ME)).toEqual({ place: "dm", id: ME })
    // A DM the reader isn't in, or while who reads isn't known, names nothing.
    expect(draftPlaceOf(key, "someone-else")).toBeNull()
    expect(draftKeyOf("dm", MAYA, null)).toBeNull()
  })

  it("names nothing for a key that isn't one", () => {
    for (const key of ["", "channel", "channel:", "doc:d1", "thread:r1"]) expect(draftPlaceOf(key, ME)).toBeNull()
  })
})
