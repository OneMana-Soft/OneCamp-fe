import { describe, expect, it } from "vitest"
import { sanitizeImportedDocument, sanitizePlainHtml, sanitizeRichHtml } from "./sanitizeHtml"

// What a message, a doc or an email may look like once sanitised. The app has
// a utility class for nearly anything, so a class the editor doesn't write
// could lay out the page: "fixed inset-0 z-50" made a message a full-screen
// overlay posing as a sign-in page.

const OVERLAY = "fixed inset-0 z-50 bg-background flex items-center justify-center"

const parse = (html: string) => {
  const box = document.createElement("div")
  box.innerHTML = html
  return box
}

describe("sanitizeRichHtml", () => {
  it("drops classes the editor doesn't write, from every element", () => {
    const out = parse(
      sanitizeRichHtml(
        `<div class="${OVERLAY}"><p class="${OVERLAY}">Your session expired. <a class="${OVERLAY}" href="https://evil.example/login">Sign in</a></p><span class="${OVERLAY}">x</span></div>`,
      ),
    )
    expect(out.querySelectorAll("[class]")).toHaveLength(0)
    expect(out.textContent).toBe("Your session expired. Sign inx")
    expect(out.querySelector("a")?.getAttribute("href")).toBe("https://evil.example/login")
  })

  it("keeps the editor's own classes, and only those", () => {
    const html = [
      '<h2 class="heading-node">Plan</h2>',
      '<p class="text-node">Ship <code class="inline">it</code> with <span class="mention hover:cursor-pointer" data-type="mention" data-id="u1" data-label="Maya">@Maya</span> in <span class="channel-mention hover:cursor-pointer" data-type="channelMention" data-id="c1" data-label="eng">#eng</span>, see <a class="link" href="https://example.com">the notes</a></p>',
      '<ul class="list-node"><li><p class="text-node">One</p></li></ul>',
      '<blockquote class="block-node"><p class="text-node">Quoted</p></blockquote>',
      '<pre class="block-node"><code class="language-go">go test</code></pre>',
      '<ul class="task-list" data-type="taskList"><li class="task-item" data-checked="true">Done</li></ul>',
    ].join("")
    const out = parse(sanitizeRichHtml(html))
    expect([...out.querySelectorAll("[class]")].map((el) => `${el.tagName.toLowerCase()}.${el.getAttribute("class")}`)).toEqual([
      "h2.heading-node",
      "p.text-node",
      "code.inline",
      "span.mention hover:cursor-pointer",
      "span.channel-mention hover:cursor-pointer",
      "a.link",
      "ul.list-node",
      "p.text-node",
      "blockquote.block-node",
      "p.text-node",
      "pre.block-node",
      "code.language-go",
      "ul.task-list",
      "li.task-item",
    ])
    const mixed = parse(sanitizeRichHtml(`<p class="text-node ${OVERLAY}">x</p>`))
    expect(mixed.querySelector("p")?.getAttribute("class")).toBe("text-node")
  })
})

describe("sanitizePlainHtml", () => {
  it("keeps a search highlight and drops classes around it", () => {
    const out = parse(sanitizePlainHtml(`<span class="${OVERLAY}">the <em>notes</em></span>`))
    expect(out.querySelectorAll("[class]")).toHaveLength(0)
    expect(out.querySelector("em")?.textContent).toBe("notes")
  })
})

describe("sanitizeImportedDocument", () => {
  it("drops the classes an uploaded document carries", () => {
    const out = parse(sanitizeImportedDocument(`<p class="${OVERLAY}">Quarterly report</p><table class="w-screen h-screen"><tr><td class="fixed">1</td></tr></table>`))
    expect(out.querySelectorAll("[class]")).toHaveLength(0)
    expect(out.textContent).toBe("Quarterly report1")
  })
})
