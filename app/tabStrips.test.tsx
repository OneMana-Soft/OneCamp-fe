import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * EVERY TAB STRIP SCROLLS ONE WAY (15 Oct 2026). On a phone the projects'
 * tabs ended in a bare "G" and Reports was off screen, reading as broken, not
 * as more to scroll to. A strip that scrolls sideways carries data-edge-fade
 * (app/interaction.css): the edge with more past it fades, and it comes to
 * rest on a whole tab, clear of the fade. The docs home's tabs and the search
 * chips drew fades of their own; they take the shared one now.
 */
const ROOT = process.cwd()
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx$/.test(name) && !/\.test\./.test(name)) out.push(p)
  }
  return out
}
const SOURCES = ["app", "components"].flatMap((d) => walk(join(ROOT, d))).map((f) => ({ file: relative(ROOT, f), src: readFileSync(f, "utf8") }))

function styleSheets(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) styleSheets(p, out)
    else if (/\.css$/.test(name)) out.push(p)
  }
  return out
}
/** Every stylesheet but the layer's own, which holds the one fade. */
const SHEETS = ["app", "components"]
  .flatMap((d) => styleSheets(join(ROOT, d)))
  .map((f) => ({ file: relative(ROOT, f), src: readFileSync(f, "utf8") }))
  .filter(({ file }) => file !== join("app", "interaction.css"))

/** Each opening tag that is a tablist scrolling sideways. */
function scrollingTablists(src: string): string[] {
  return [...src.matchAll(/<[A-Za-z.]+\b[^>]*role="tablist"[^>]*>/g)].map((m) => m[0]).filter((tag) => /overflow-x-auto/.test(tag))
}

describe("tab strips that scroll", () => {
  it("all fade the edge with more past them and rest on a whole tab", () => {
    const bare = SOURCES.flatMap(({ file, src }) => scrollingTablists(src).filter((t) => !/data-edge-fade/.test(t)).map((t) => `${file}: ${t.slice(0, 100)}`))
    expect(bare).toEqual([])
  })

  it("draw no fade of their own beside the shared one", () => {
    const own = SOURCES.filter(({ src }) => /mask-image:linear-gradient\((?:90deg|to_right)/.test(src) && /overflow-x-auto/.test(src)).map(({ file }) => file)
    expect(own).toEqual([])
  })

  // AI & agents' tabs carried data-edge-fade and, on a phone, a mask of their
  // own in app/styles/admin/ai.css, so one rule hid the other by load order.
  it("draw no sideways fade of their own in a stylesheet either", () => {
    const own = SHEETS.filter(({ src }) => /mask-image:\s*linear-gradient\(\s*(?:90deg|270deg|to right|to left)/.test(src)).map(({ file }) => file)
    expect(own).toEqual([])
  })

  it("include every row of underline tabs", () => {
    const bare = SOURCES.flatMap(({ file, src }) =>
      [...src.matchAll(/<TabsList\b[^>]*variant="underline"[^>]*>/g)].filter((m) => !/data-edge-fade/.test(m[0])).map((m) => `${file}: ${m[0].slice(0, 100)}`),
    )
    expect(bare).toEqual([])
  })

  it("snap to a whole tab, clear of the fade", () => {
    const css = readFileSync(join(ROOT, "app/interaction.css"), "utf8")
    expect(css).toMatch(/\[data-edge-fade\] \{\s*scroll-snap-type: x proximity;\s*scroll-padding-inline: 24px;/)
    expect(css).toMatch(/\[data-edge-fade\] > :not\(\[aria-hidden="true"\]\) \{\s*scroll-snap-align: start;/)
  })
})
