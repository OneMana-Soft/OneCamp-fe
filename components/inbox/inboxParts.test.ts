import { describe, expect, it } from "vitest"

import { foldedAtStart, inboxKeyAction, senderAddress, splitQuoted, threadByline } from "@/components/inbox/inboxParts"

describe("Mail's parts", () => {
  it("reads the address out of a From header", () => {
    expect(senderAddress('"Maya Chen" <maya@acme.com>')).toBe("maya@acme.com")
    expect(senderAddress("maya@acme.com")).toBe("maya@acme.com")
    expect(senderAddress("Maya")).toBe("")
  })

  it("folds all but the last two of a conversation longer than three", () => {
    expect([...foldedAtStart(3)]).toEqual([])
    expect([...foldedAtStart(5)]).toEqual([0, 1, 2])
  })

  it("splits a body at Gmail's quoted history", () => {
    const html = '<p>Sounds good.</p><div class="gmail_quote">On Mon, Maya wrote: ...</div>'
    expect(splitQuoted(html)).toEqual({ body: "<p>Sounds good.</p>", quoted: '<div class="gmail_quote">On Mon, Maya wrote: ...</div>' })
    expect(splitQuoted("<blockquote>only a quote</blockquote>").quoted).toBe("")
  })

  it("names who wrote in a conversation, the reader as you", () => {
    const m = (from: string) => ({ id: from, from, to: "", date: "", subject: "", body: "" })
    expect(threadByline([m("Maya <m@x>"), m("Sam <s@x>"), m("Maya <m@x>")], "s@x")).toBe("3 messages · Maya, you")
  })

  it("maps the page's keys, and none with a modifier", () => {
    expect(inboxKeyAction({ key: "j", metaKey: false, ctrlKey: false, altKey: false })).toBe("next")
    expect(inboxKeyAction({ key: "s", metaKey: false, ctrlKey: false, altKey: false })).toBe("summarise")
    expect(inboxKeyAction({ key: "s", metaKey: true, ctrlKey: false, altKey: false })).toBeNull()
  })
})
