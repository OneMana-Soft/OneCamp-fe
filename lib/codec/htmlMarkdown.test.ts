import { describe, expect, it } from "vitest"
import { htmlOfMarkdown, markdownOfHTML } from "./htmlMarkdown"

// A task's description, kept as HTML, edited as Markdown in a plain box (the task templates' manager).
describe("a kept HTML body edited as Markdown", () => {
  it("reads nothing as nothing, both ways", () => {
    for (const none of ["", "   ", undefined, null]) expect(markdownOfHTML(none)).toBe("")
    for (const none of ["", "  \n\n", "\t"]) expect(htmlOfMarkdown(none)).toBe("")
  })

  it("reads a description as Markdown and writes it back as the same HTML", () => {
    const kept = "<h3>Steps to reproduce</h3><ol><li><p>Open it</p></li></ol>"
    const md = markdownOfHTML(kept)
    expect(md).toBe("### Steps to reproduce\n\n1. Open it")
    expect(htmlOfMarkdown(md)).toBe(kept)
    expect(htmlOfMarkdown(markdownOfHTML("<p>Steps to see it</p>"))).toBe("<p>Steps to see it</p>")
  })

  it("keeps a checklist a checklist, as the task's editor holds one", () => {
    const md = markdownOfHTML('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><label><input type="checkbox"></label><div><p>Reproduce</p></div></li></ul>')
    expect(md).toBe("- [ ] Reproduce")
    const html = htmlOfMarkdown(`${md}\n- [x] Fixed`)
    expect(html).toContain('data-type="taskList"')
    expect(html).toMatch(/data-checked="false"[^>]*>.*Reproduce.*data-checked="true"[^>]*>.*Fixed/)
  })

  it("writes no script, handler or unsafe link from what's typed", () => {
    expect(htmlOfMarkdown("[open](javascript:alert(1))")).toBe("<p>open</p>")
    expect(htmlOfMarkdown("<script>alert(1)</script>hi")).toBe("<p>hi</p>")
    expect(htmlOfMarkdown("<img src=x onerror=alert(1)>")).not.toMatch(/onerror|alert/)
    expect(htmlOfMarkdown('a <b onclick="alert(1)">b</b>')).not.toMatch(/onclick|alert/)
  })
})
