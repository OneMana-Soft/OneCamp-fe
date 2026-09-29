import { describe, expect, it } from "vitest"
import { taskDraftFromMessage, taskMadeReply, taskNameFromText } from "./messageToTask"

describe("taskNameFromText", () => {
  it("takes the first sentence and drops its full stop", () => {
    expect(taskNameFromText("Can someone update the pricing page. It still says 2.6.")).toBe(
      "Can someone update the pricing page",
    )
  })
  it("keeps a question mark", () => {
    expect(taskNameFromText("Who owns the SSO bug? Nobody replied.")).toBe("Who owns the SSO bug?")
  })
  it("cuts a long sentence on a word boundary", () => {
    const name = taskNameFromText("word ".repeat(60))
    expect(name.length).toBeLessThanOrEqual(121)
    expect(name.endsWith("word…")).toBe(true)
  })
  it("reads past a one-word opener", () => {
    expect(taskNameFromText("Great. Then the only thing left is the announcement. Thanks!")).toBe(
      "Great. Then the only thing left is the announcement",
    )
  })
  it("is empty for an empty message", () => {
    expect(taskNameFromText("   ")).toBe("")
  })
})

describe("taskDraftFromMessage", () => {
  const source = { postUUID: "p1", link: "https://acme.test/app/channel/c1/p1", authorName: "Priya <N>" }

  it("quotes the message and links back to it", () => {
    const d = taskDraftFromMessage("<p>Ship the <b>release notes</b> by Friday.</p>", source)
    expect(d.name).toBe("Ship the release notes by Friday")
    expect(d.text).toBe("Ship the release notes by Friday.")
    expect(d.description).toBe(
      '<blockquote><p>Ship the release notes by Friday.</p></blockquote>' +
        '<p>From <a href="https://acme.test/app/channel/c1/p1">Priya &lt;N&gt;\'s message</a></p>',
    )
  })

  it("leaves an opening mention out of the name, not the quote", () => {
    const html =
      '<p><span data-type="mention" data-id="u1" data-label="Sam Rivera">@Sam Rivera</span> can we get the rollback steps in before Thursday?</p>'
    const d = taskDraftFromMessage(html, source)
    expect(d.name).toBe("Can we get the rollback steps in before Thursday?")
    expect(d.text).toBe("@Sam Rivera can we get the rollback steps in before Thursday?")
  })

  it("never lets message text become markup", () => {
    const d = taskDraftFromMessage("<p>a &lt;script&gt;alert(1)&lt;/script&gt;</p>", source)
    expect(d.description).not.toContain("<script>")
    expect(d.description).toContain("&lt;script&gt;")
  })

  it("still links back when the message has no text", () => {
    const d = taskDraftFromMessage("", { link: "https://acme.test/app/chat/u1/m1" })
    expect(d.name).toBe("")
    expect(d.description).toBe('<p>From <a href="https://acme.test/app/chat/u1/m1">the message</a></p>')
  })
})

describe("taskMadeReply", () => {
  it("links the new task by name", () => {
    expect(taskMadeReply("https://acme.test", "t-1", "Fix <SSO>")).toBe(
      '<p>Made this a task: <a href="https://acme.test/app/task/t-1">Fix &lt;SSO&gt;</a></p>',
    )
  })
})
