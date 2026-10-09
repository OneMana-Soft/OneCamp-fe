import { describe, expect, it } from "vitest"
import { relayInitials, relayKindOf, relayedAuthorOf, splitPlainRelayLabel, splitRelayLabel } from "@/lib/relayedAuthor"

// What the server stores for a channel guest's and a Slack person's message
// (botpost.LabelledHTML, then the sanitising pass of posting), byte for byte;
// the backend's TestLabelledHTMLSurvivesPosting pins it.
const GUEST = "<p><strong>[Priya (Acme) (guest)]</strong></p><p>Looks good, ship it</p>"
const SLACK = "<p><strong>[Ana Ruiz]</strong></p><p>one<br/>two</p>"

describe("splitRelayLabel", () => {
  it("reads a guest's name out of the label and leaves only what they wrote", () => {
    expect(splitRelayLabel(GUEST, "guest")).toEqual({ name: "Priya (Acme)", body: "<p>Looks good, ship it</p>", kind: "guest" })
  })

  it("reads a Slack person's name as the label gives it", () => {
    expect(splitRelayLabel(SLACK, "bridge")).toEqual({ name: "Ana Ruiz", body: "<p>one<br/>two</p>", kind: "bridge" })
    // Only a guest's label ends in "(guest)"; a Slack name is left whole.
    expect(splitRelayLabel("<p><strong>[Bo (guest)]</strong></p><p>x</p>", "bridge")?.name).toBe("Bo (guest)")
  })

  it("keeps every paragraph and line break the person wrote", () => {
    const got = splitRelayLabel("<p><strong>[Ana (guest)]</strong></p><p>one<br>two</p><p>three</p>", "guest")
    expect(got?.body).toBe("<p>one<br>two</p><p>three</p>")
  })

  it("decodes the escaped name", () => {
    expect(splitRelayLabel("<p><strong>[O&#39;Neil &amp; Co (guest)]</strong></p><p>hi</p>", "guest")?.name).toBe("O'Neil & Co")
  })

  it("keeps brackets that are part of the name", () => {
    expect(splitRelayLabel("<p><strong>[Bo [ops] (guest)]</strong></p><p>hi</p>", "guest")?.name).toBe("Bo [ops]")
  })

  it("names someone who gave no name plainly", () => {
    expect(splitRelayLabel("<p><strong>[A guest]</strong></p><p>hi</p>", "guest")?.name).toBe("Guest")
  })

  it("reads the inline form, before plain text", () => {
    expect(splitRelayLabel("<p><strong>[Priya (guest)]</strong> hello</p>", "guest")).toEqual({ name: "Priya", body: "<p>hello</p>", kind: "guest" })
  })

  it("leaves a message without a label, or by no relay, alone", () => {
    for (const html of ["<p>Hello</p>", "<p>[not a label] text</p>", "<p>Ship <strong>[now]</strong></p>", "", null, undefined]) {
      expect(splitRelayLabel(html, "guest")).toBeNull()
    }
    expect(splitRelayLabel(GUEST, null)).toBeNull()
  })
})

describe("relayedAuthorOf", () => {
  it("reads only the Guests and Slack bots' messages", () => {
    expect(relayKindOf("guest")).toBe("guest")
    expect(relayKindOf("bridge")).toBe("bridge")
    for (const kind of ["agent", "assistant", "checkin", "automation", "bot", undefined]) {
      expect(relayedAuthorOf(kind, GUEST), String(kind)).toBeNull()
    }
    expect(relayedAuthorOf("bridge", SLACK)?.name).toBe("Ana Ruiz")
  })
})

describe("splitPlainRelayLabel", () => {
  // Search indexes the stored text with its tags stripped and entities kept.
  it("reads a guest's search hit", () => {
    expect(splitPlainRelayLabel("[Priya (Acme) (guest)]Looks good", "guest")).toEqual({ name: "Priya (Acme)", body: "Looks good", kind: "guest" })
    expect(splitPlainRelayLabel("[Bo [ops] (guest)]hi", "guest")?.name).toBe("Bo [ops]")
    expect(splitPlainRelayLabel("[A guest]hi", "guest")).toEqual({ name: "Guest", body: "hi", kind: "guest" })
    expect(splitPlainRelayLabel("[O&#39;Neil (guest)]hi", "guest")?.name).toBe("O'Neil")
  })

  it("reads a highlighted hit, with the highlight inside the label", () => {
    expect(splitPlainRelayLabel("[<em>Priya</em> (Acme) (<em>guest</em>)]<em>Looks</em> good", "guest")).toEqual({
      name: "Priya (Acme)",
      body: "<em>Looks</em> good",
      kind: "guest",
    })
  })

  it("reads a Slack person's search hit", () => {
    expect(splitPlainRelayLabel("[Ana Ruiz]On it", "bridge")).toEqual({ name: "Ana Ruiz", body: "On it", kind: "bridge" })
  })

  it("leaves text without a label alone", () => {
    expect(splitPlainRelayLabel("Looks good", "guest")).toBeNull()
    expect(splitPlainRelayLabel("[todo] ship it", "guest")).toBeNull()
    expect(splitPlainRelayLabel("[Priya (guest)]hi", null)).toBeNull()
  })
})

describe("relayInitials", () => {
  it("takes initials from the name, not the company in brackets", () => {
    expect(relayInitials("Priya (Acme)")).toBe("P")
    expect(relayInitials("Priya Rao (Acme Inc)")).toBe("PR")
    expect(relayInitials("(Acme)")).toBe("?")
  })
})
