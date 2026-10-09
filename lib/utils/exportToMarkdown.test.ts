import { afterEach, describe, expect, it } from "vitest"
import { htmlToMarkdown } from "./exportToMarkdown"

// Exporting reads the doc's stored body, which anyone who can edit the doc
// wrote. It was put in an element of the page to be read, so its handlers ran
// as the person exporting.

const page = () => document.documentElement

afterEach(() => {
  page().removeAttribute("data-ran")
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe("htmlToMarkdown", () => {
  it("runs nothing in the body it reads", async () => {
    const md = htmlToMarkdown(
      [
        `<p>Before</p>`,
        `<img src="x" onerror="document.documentElement.setAttribute('data-ran', 'img')">`,
        // jsdom loads no images, so this is the handler it does run: a
        // <details> that opens fires "toggle" once it's in a live document.
        `<details open ontoggle="document.documentElement.setAttribute('data-ran', 'toggle')"><summary>x</summary></details>`,
        `<script>document.documentElement.setAttribute('data-ran', 'script')</script>`,
        `<p>After</p>`,
      ].join(""),
    )
    await settle()
    expect(page().getAttribute("data-ran")).toBeNull()
    expect(md).toContain("Before")
    expect(md).toContain("After")
  })

  it("writes a doc as before", () => {
    const html = [
      '<h1 class="heading-node">Plan</h1>',
      '<h2 class="heading-node">Why</h2>',
      '<h3 class="heading-node">How</h3>',
      '<p class="text-node">Ship <strong>it</strong> <em>soon</em>, <s>not</s> <code class="inline">now</code>. See <a class="link" href="https://example.com/a?b=1&amp;c=2">the notes</a> &amp; <a class="link" href="/app/doc/d-1">the doc</a>.<br>Next line</p>',
      '<ul class="list-node"><li><p class="text-node">One</p></li><li><p class="text-node">Two</p></li></ul>',
      '<ol class="list-node"><li><p class="text-node">First</p></li><li><p class="text-node">Second</p></li></ol>',
      '<blockquote class="block-node"><p class="text-node">Quoted</p></blockquote>',
      '<pre><code class="language-go">go test ./...</code></pre>',
      "<hr>",
      '<p class="text-node"><img src="https://cdn.example.com/a.png" alt="Diagram"></p>',
      '<div data-type="callout" data-emoji="!"><p>Careful</p></div>',
      '<div data-type="collapsible" data-title="More"><p>Hidden</p></div>',
    ].join("")

    // What the converter wrote for this doc before it stopped using the page.
    expect(htmlToMarkdown(html)).toBe(
      "\n# Plan\n\n## Why\n\n### How\n\n" +
        "Ship **it** *soon*, ~~not~~ `now`. See [the notes](https://example.com/a?b=1&c=2) & [the doc](/app/doc/d-1).\nNext line\n" +
        "- One\n- Two\n1. First\n2. Second\n> Quoted\n\n" +
        "```\n`go test ./...`\n```\n\n---\n\n" +
        "![Diagram](https://cdn.example.com/a.png)\n\n" +
        "> ! \nCareful\n\n\n" +
        "<details>\n<summary>More</summary>\n\n\nHidden\n\n</details>\n",
    )
  })
})
