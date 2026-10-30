import { describe, expect, it } from "vitest"

import { EMBED_FRAME_ORIGINS, EMBED_SITE_NAMES } from "./origins"
import { embedFor, hostAllowed } from "./providers"

// One link per site the editor embeds (editor.md P1-5), and the address its
// frame loads: the site's own player or viewer, never a third-party service.
const CASES: Array<[string, string, string]> = [
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=90"],
  ["https://youtu.be/dQw4w9WgXcQ?t=42", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&start=42"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "youtube", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"],
  ["https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs", "youtube", "https://www.youtube-nocookie.com/embed/videoseries?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs"],
  ["https://vimeo.com/76979871", "vimeo", "https://player.vimeo.com/video/76979871?dnt=1"],
  ["https://vimeo.com/76979871/8d5b1a2c3e", "vimeo", "https://player.vimeo.com/video/76979871?dnt=1&h=8d5b1a2c3e"],
  ["https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184", "loom", "https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184"],
  [
    "https://www.figma.com/design/AbC123/Launch-plan?node-id=1-2",
    "figma",
    "https://www.figma.com/embed?embed_host=onecamp&url=https%3A%2F%2Fwww.figma.com%2Fdesign%2FAbC123%2FLaunch-plan%3Fnode-id%3D1-2",
  ],
  ["https://docs.google.com/document/d/1AbCdEf_gH/edit#heading=h.1", "google-docs", "https://docs.google.com/document/d/1AbCdEf_gH/preview"],
  ["https://docs.google.com/spreadsheets/d/1AbCdEf_gH/edit#gid=0", "google-sheets", "https://docs.google.com/spreadsheets/d/1AbCdEf_gH/preview"],
  ["https://docs.google.com/presentation/d/1AbCdEf_gH/edit", "google-slides", "https://docs.google.com/presentation/d/1AbCdEf_gH/embed"],
  ["https://www.google.com/maps/place/Lalbagh+Botanical+Garden/@12.9507,77.5848,15z", "google-maps", "https://www.google.com/maps?q=Lalbagh+Botanical+Garden&z=15&output=embed"],
  ["https://maps.google.com/maps?q=Bengaluru", "google-maps", "https://www.google.com/maps?q=Bengaluru&output=embed"],
  ["https://gist.github.com/octocat/6cad326836d38bd3a7ae", "gist", "https://gist.github.com/octocat/6cad326836d38bd3a7ae.pibb"],
  ["https://codepen.io/team/pen/abcDEF", "codepen", "https://codepen.io/team/embed/abcDEF?default-tab=result"],
  ["https://excalidraw.com/#json=abc123,def456", "excalidraw", "https://excalidraw.com/#json=abc123,def456"],
  ["https://miro.com/app/board/uXjVabc=/", "miro", "https://miro.com/app/live-embed/uXjVabc=/?autoplay=yep"],
  ["https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC", "spotify", "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"],
  ["https://x.com/jack/status/20", "x", "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true"],
  ["https://twitter.com/jack/status/20", "x", "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true"],
]

describe("embeds", () => {
  it.each(CASES)("%s embeds from %s's own player", (href, provider, src) => {
    const e = embedFor(href, [], "app.example.test")
    expect(e?.provider).toBe(provider)
    expect(e?.src).toBe(src)
  })

  // A CSP check for each provider (B4): what the frame loads is an origin the
  // page's frame-src lets in, and the list has nothing no embed uses.
  it("frames every embed from an origin the CSP lists, and lists none it doesn't use", () => {
    const used = new Set<string>()
    for (const [href] of CASES) {
      const origin = new URL(embedFor(href, [], "app.example.test")!.src).origin
      expect(EMBED_FRAME_ORIGINS, href).toContain(origin)
      used.add(origin)
    }
    expect([...EMBED_FRAME_ORIGINS].filter((o) => !used.has(o))).toEqual([])
  })

  it("names every built-in provider in Settings' list of sites, and lists no site it doesn't embed", () => {
    const providers = ["youtube", "vimeo", "loom", "figma", "google-docs", "google-sheets", "google-slides", "google-forms", "google-maps", "gist", "codepen", "excalidraw", "miro", "spotify", "x"]
    const google = EMBED_SITE_NAMES.find((n) => n.startsWith("Google "))!
    const listed = (name: string) => (EMBED_SITE_NAMES as readonly string[]).includes(name) || (name.startsWith("Google ") && google.includes(name.slice("Google ".length)))
    const seen = new Map<string, string>()
    for (const href of [...CASES.map(([h]) => h), "https://docs.google.com/forms/d/e/1FAIpQLSdAbC/viewform"]) {
      const e = embedFor(href, [], "app.example.test")!
      expect(listed(e.name), `${e.name}, from ${href}`).toBe(true)
      expect(EMBED_FRAME_ORIGINS, href).toContain(new URL(e.src).origin)
      seen.set(e.provider, e.name)
    }
    expect([...seen.keys()].sort()).toEqual([...providers].sort())
    const names = [...seen.values()]
    expect(EMBED_SITE_NAMES.filter((n) => n !== google && !names.includes(n))).toEqual([])
  })

  it("frames nothing it can't name: pages, home pages and short links stay links", () => {
    for (const href of [
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/",
      "https://www.youtube.com/watch?v=short",
      "https://vimeo.com/channels/staffpicks",
      "https://www.figma.com/files/recent",
      "https://maps.app.goo.gl/abc",
      "https://www.google.com/search?q=maps",
      "https://x.com/jack",
      "https://excalidraw.com/",
      "javascript:alert(1)",
      "https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ",
      "not a link",
    ]) {
      expect(embedFor(href, [], "app.example.test"), href).toBeNull()
    }
  })

  it("never lets a frame take the page away, and sends no referrer but the origin to the two players that need one", () => {
    for (const [href] of CASES) {
      const e = embedFor(href, [], "app.example.test")!
      expect(e.sandbox).not.toMatch(/allow-top-navigation/)
      expect(e.referrerPolicy).toBe(e.provider === "youtube" || e.provider === "vimeo" ? "strict-origin" : "no-referrer")
    }
    expect(embedFor(CASES.find(([, p]) => p === "gist")![0], [], "")!.sandbox).not.toMatch(/allow-scripts/)
  })

  it("frames an admin's host as it is, https only, never the app's own", () => {
    const hosts = ["embed.example.com", "*.charts.example.org"]
    expect(embedFor("https://embed.example.com/v/1", hosts, "app.example.test")).toMatchObject({ provider: "site", src: "https://embed.example.com/v/1" })
    expect(embedFor("https://eu.charts.example.org/x", hosts, "app.example.test")?.provider).toBe("site")
    expect(embedFor("https://charts.example.org/x", hosts, "app.example.test")).toBeNull()
    expect(embedFor("http://embed.example.com/v/1", hosts, "app.example.test")).toBeNull()
    expect(embedFor("https://other.example.com/", hosts, "app.example.test")).toBeNull()
    expect(embedFor("https://app.example.test/app/doc/1", ["app.example.test"], "app.example.test")).toBeNull()
  })

  it("reads an admin's entries loosely: case, a trailing dot and spaces", () => {
    expect(hostAllowed("Embed.Example.com", [" embed.example.com. "])).toBe(true)
    expect(hostAllowed("evil-example.com", ["*.example.com"])).toBe(false)
    expect(hostAllowed("example.com", [""])).toBe(false)
  })
})
