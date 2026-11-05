import { describe, expect, it } from "vitest"
import { embedCode } from "./embedCode"

describe("a share link's embed code", () => {
  it("frames the link's /embed page at full width, 480 high, borderless and lazy", () => {
    expect(embedCode("https://acme.example/guest/b/tok", "Roadmap")).toBe(
      '<iframe src="https://acme.example/guest/b/tok/embed" title="Roadmap" width="100%" height="480" style="border:0" loading="lazy" allowfullscreen></iframe>',
    )
  })

  it("takes the link with or without a trailing slash", () => {
    expect(embedCode("https://acme.example/guest/b/tok/", "Roadmap")).toContain('src="https://acme.example/guest/b/tok/embed"')
  })

  it("keeps a name with quotes or tags as text in the other site's page", () => {
    const code = embedCode("https://acme.example/guest/b/tok", `Q4 "plan" <script>alert(1)</script> & more`)
    expect(code).toContain('title="Q4 &quot;plan&quot; &lt;script&gt;alert(1)&lt;/script&gt; &amp; more"')
    expect(code).not.toContain("<script>")
    // One element, closed: nothing of the name opens another.
    const doc = new DOMParser().parseFromString(code, "text/html")
    expect(doc.body.children).toHaveLength(1)
    expect(doc.querySelector("iframe")?.getAttribute("title")).toBe(`Q4 "plan" <script>alert(1)</script> & more`)
  })
})
