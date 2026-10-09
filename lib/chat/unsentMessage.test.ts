import { describe, expect, it } from "vitest"
import type { AttachmentMediaReq } from "@/types/attachment"
import type { FilePreview } from "@/store/slice/channelSlice"
import { withUnsent, type Draft } from "./unsentMessage"

const file = (key: string) => ({ attachment_obj_key: key, attachment_uuid: `u-${key}`, attachment_file_name: `${key}.png` }) as AttachmentMediaReq
const preview = (key: string) => ({ key, fileName: `${key}.png`, progress: 100 }) as FilePreview
const empty: Draft = { html: "", files: [], previews: [] }
const unsent: Draft = {
  html: "<p>Ship it on <strong>Friday</strong></p>",
  files: [file("a")],
  previews: [preview("a")],
  replyToUuid: "p1",
  replyToAuthorName: "Maya",
  replyToText: "When do we ship?",
}

describe("withUnsent", () => {
  it("puts the whole message back into an empty composer", () => {
    expect(withUnsent(empty, unsent)).toEqual(unsent)
    expect(withUnsent({ ...empty, html: "<p></p>" }, unsent)).toEqual(unsent)
  })

  it("keeps what was typed since, after the message", () => {
    const next = withUnsent({ ...empty, html: "<p>and Monday</p>" }, unsent)
    expect(next.html).toBe("<p>Ship it on <strong>Friday</strong></p><p>and Monday</p>")
  })

  it("keeps what was attached since, after the message's own, each once", () => {
    const next = withUnsent({ ...empty, files: [file("b"), file("a")], previews: [preview("b"), preview("a")] }, unsent)
    expect(next.files.map((f) => f.attachment_obj_key)).toEqual(["a", "b"])
    expect(next.previews.map((p) => p.key)).toEqual(["a", "b"])
  })

  it("keeps a reply target chosen since, and the message's own otherwise", () => {
    expect(withUnsent({ ...empty, replyToUuid: "p2", replyToAuthorName: "Sam", replyToText: "Later?" }, unsent)).toMatchObject({
      replyToUuid: "p2",
      replyToAuthorName: "Sam",
      replyToText: "Later?",
    })
    expect(withUnsent({ ...empty, html: "<p>x</p>" }, unsent)).toMatchObject({ replyToUuid: "p1", replyToAuthorName: "Maya" })
  })
})
