import { describe, expect, it } from "vitest"

import { COPY_LINKS, RESET_EMAIL_OFF, invitePromise, inviteVerb, linksCopied, linksText, unsentLine } from "@/lib/invite/inviteCopy"

// One table of the honest words about invitations and mailed links (SHELL-02,
// SHELL-26, ADMIN-21): every invite surface and the forgot-password page read
// it, so a server without email is never promised an email anywhere.

describe("what an invitation promises", () => {
  it("promises an email only when the server can send one, and a link to share when it can't", () => {
    expect(invitePromise(true)).toBe("Each gets an email with a link to join, good for seven days.")
    expect(invitePromise(false)).toBe("This server can't send email yet, so you'll get a link to share with each person yourself.")
    expect(invitePromise(false)).not.toMatch(/gets an email|email with a link/)
    expect(inviteVerb(true)).toBe("Send")
    expect(inviteVerb(false)).toBe("Create")
  })

  it("says why emails didn't go, and what to do with the links", () => {
    expect(unsentLine(false)).toBe("Email isn't set up yet. Share these links, or set up email in Admin › Email.")
    expect(unsentLine(true)).toBe("Some emails didn't go. Share their links yourself.")
    expect(unsentLine(false, { admin: false })).toBe("Email isn't set up yet. Share these links yourself.")
  })
})

describe("handing over every link at once", () => {
  it("names the action, copies one address and link a line, and counts them", () => {
    expect(COPY_LINKS).toBe("Copy all links")
    expect(linksText([
      { email: "ana@example.com", link: "https://camp.example.com/a" },
      { email: "ben@example.com", link: "https://camp.example.com/b" },
    ])).toBe("ana@example.com — https://camp.example.com/a\nben@example.com — https://camp.example.com/b")
    expect(linksCopied(3)).toBe("3 invitation links copied")
    expect(linksCopied(1)).toBe("1 invitation link copied")
  })
})

describe("a reset link on a server without email", () => {
  it("says no link will arrive, and who can help", () => {
    expect(RESET_EMAIL_OFF).toBe("This workspace can't send email yet, so no link will arrive. Ask your workspace admin to set up email or to help you sign in.")
  })
})
