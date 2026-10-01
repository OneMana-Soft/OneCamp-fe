import { describe, expect, it } from "vitest"
import { taskFromEmail } from "./emailToTask"
import { senderName, shortDate } from "@/services/inboxService"

describe("taskFromEmail", () => {
  it("names the task after the subject and links back to the email", () => {
    const { draft, source } = taskFromEmail("Re: invoice for September", "Priya", "Please pay by Friday", "https://mail.google.com/mail/u/0/#all/abc")
    expect(draft.name).toBe("Invoice for September")
    expect(draft.description).toContain("<blockquote><p>Please pay by Friday</p></blockquote>")
    expect(draft.description).toContain('href="https://mail.google.com/mail/u/0/#all/abc"')
    expect(source.postUUID).toBeUndefined()
  })

  it("escapes what an email sender controls", () => {
    const { draft } = taskFromEmail("<img src=x onerror=1>", '"><script>', "<b>x</b>", "https://mail.google.com/x")
    expect(draft.description).not.toContain("<script>")
    expect(draft.description).not.toContain("<b>x</b>")
  })

  it("has a name even without a subject", () => {
    expect(taskFromEmail("", "", "", "https://mail.google.com/x").draft.name).toBe("Follow up on email")
  })
})

describe("inbox display helpers", () => {
  it("shows a sender's name, or the address when there is none", () => {
    expect(senderName('"Priya Sharma" <priya@x.com>')).toBe("Priya Sharma")
    expect(senderName("Priya <priya@x.com>")).toBe("Priya")
    expect(senderName("<noreply@x.com>")).toBe("noreply@x.com")
    expect(senderName("noreply@x.com")).toBe("noreply@x.com")
  })

  it("shows the time for today and the date otherwise", () => {
    const now = new Date("2026-10-01T15:00:00")
    expect(shortDate("not a date", now)).toBe("")
    expect(shortDate("2026-10-01T09:30:00", now)).toMatch(/9/)
    expect(shortDate("2026-09-02T09:30:00", now)).toMatch(/2/)
  })
})
