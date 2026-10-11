import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

// Design v3 chat, C25, as merged with content's F05 stage (integration,
// 11 Oct): the lightbox canvas is a fixed near-black in both themes, so a
// bright screenshot never blasts white on white; nothing is blurred (a blur
// over a photo costs a frame and reads as fog); what it shows crossfades in,
// keyed by the item, with no transition on the dialog's size.
const src = readFileSync("components/dialog/attachmentLightboxDialog.tsx", "utf8")

describe("the lightbox", () => {
  it("draws a dark canvas that does not follow the theme", () => {
    expect(src).toMatch(/data-lightbox=""/)
    expect(src).toMatch(/bg-\[rgb\(8_9_10\/\.92\)\]/)
  })
  it("blurs nothing", () => {
    expect(src).not.toMatch(/backdrop-blur/)
  })
  it("crossfades each item in, and never transitions the dialog's layout", () => {
    expect(src).toMatch(/key=\{currentMedia\??\.attachment_uuid\} className="[^"]*content-view-in/)
    expect(src).not.toMatch(/\btransition duration-300\b/)
  })
})
