import { describe, expect, it } from "vitest"
import { guestInitials, splitGuestLabel } from "@/lib/guestAuthor"

// What the server stores for a channel guest's message (botpost.LabelledHTML
// over GuestMessageHTML), byte for byte; backend guestChannel_test pins it.
const STORED = "<p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good, ship it</p>"

describe("splitGuestLabel", () => {
  it("reads the guest's name out of the label and leaves only what they wrote", () => {
    expect(splitGuestLabel(STORED)).toEqual({ name: "Priya (Acme)", body: "<p>Looks good, ship it</p>" })
  })

  it("keeps every paragraph and line break the guest wrote", () => {
    const got = splitGuestLabel("<p><strong>[Ana (guest)]</strong></p><p>one<br>two</p><p>three</p>")
    expect(got?.body).toBe("<p>one<br>two</p><p>three</p>")
  })

  it("decodes the escaped name", () => {
    expect(splitGuestLabel("<p><strong>[O&#39;Neil &amp; Co (guest)]</strong></p><p>hi</p>")?.name).toBe("O'Neil & Co")
  })

  it("keeps brackets that are part of the name", () => {
    expect(splitGuestLabel("<p><strong>[Bo [ops] (guest)]</strong></p><p>hi</p>")?.name).toBe("Bo [ops]")
  })

  it("names someone who gave no name plainly", () => {
    expect(splitGuestLabel("<p><strong>[A guest]</strong></p><p>hi</p>")?.name).toBe("Guest")
  })

  it("reads the inline form, before plain text", () => {
    expect(splitGuestLabel("<p><strong>[Priya (guest)]</strong> hello</p>")).toEqual({ name: "Priya", body: "<p>hello</p>" })
  })

  it("leaves a message without a label alone", () => {
    for (const html of ["<p>Hello</p>", "<p>[not a label] text</p>", "<p>Ship <strong>[now]</strong></p>", "", null, undefined]) {
      expect(splitGuestLabel(html)).toBeNull()
    }
  })
})

describe("guestInitials", () => {
  it("takes initials from the name, not the company in brackets", () => {
    expect(guestInitials("Priya (Acme)")).toBe("P")
    expect(guestInitials("Priya Rao (Acme Inc)")).toBe("PR")
    expect(guestInitials("(Acme)")).toBe("G")
  })
})
