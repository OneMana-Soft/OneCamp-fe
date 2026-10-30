import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { NodeLink } from "./NodeLink"

// No docs route is fetched on sight (F1b's hand-off, step 2, and DOCS-LEAD-2's
// ruling, 21 Oct 2026). A plain next/link prefetches its route as soon as it
// is on screen, a phone's too: every folder, file, thread and trash link in a
// list fetched its route, and the doc page's code with it. A docs route goes
// through IntentLink (a page: its route and live copy on intent) or NodeLink
// (anything else: its route on intent), or says prefetch={false}.

afterEach(cleanup)

// It reads a link's address as written: one passed in a variable isn't seen
// (chat's doc link cards pass theirs; CHAT-LEAD's, as DOCS-LEAD-2 ruled).
const ROOTS = ["app", "components"]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : []
  })
}

/** The opening tags of a file's next/link elements, by the name it imports it as. */
export function linkTags(src: string): string[] {
  const name = /import\s+(\w+)\s+from\s+["']next\/link["']/.exec(src)?.[1]
  if (!name) return []
  const out: string[] = []
  const open = new RegExp(`<${name}[\\s>]`, "g")
  for (let m = open.exec(src); m; m = open.exec(src)) {
    let depth = 0
    let quote = ""
    let i = m.index + name.length + 1
    for (; i < src.length; i++) {
      const c = src[i]
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = ""
      } else if (c === '"' || c === "'" || c === "`") quote = c
      else if (c === "{") depth++
      else if (c === "}") depth--
      else if (c === ">" && depth === 0) break
    }
    out.push(src.slice(m.index, i + 1))
  }
  return out
}

/** A tag that prefetches a docs route on sight: its address is one, and nothing turns the prefetch off. */
export const onSightDocLink = (tag: string) => /href=(\{[^}]*\}|"[^"]*")/.exec(tag)?.[1].match(/app_doc_path|\/app\/doc\b/) != null && !/prefetch=\{false\}/.test(tag)

describe("docs routes are fetched on intent, never on sight", () => {
  it("has no plain link to a docs route that prefetches as it comes into view", () => {
    const onSight: string[] = []
    for (const root of ROOTS)
      for (const file of sources(root)) if (linkTags(readFileSync(file, "utf8")).some(onSightDocLink)) onSight.push(file)
    expect(onSight, "a docs route's link: IntentLink for a page, NodeLink for the rest").toEqual([])
  })

  it("reads a link's tag and its address as a file writes them", () => {
    const src = `import Link from "next/link"\nconst a = <Link href={\`\${app_doc_path}/\${id}\`} className="x">A</Link>\nconst b = <Link\n  href="/app/doc/trash"\n  onClick={() => go({ a: 1 })}\n>B</Link>\nconst c = <Link href="/app/home">C</Link>\nconst d = <Link href={\`/app/doc/\${id}\`} prefetch={false}>D</Link>`
    expect(linkTags(src).map(onSightDocLink)).toEqual([true, true, false, false])
  })
})

describe("NodeLink", () => {
  it("prefetches nothing on sight, and its route once a pointer, a focus or a touch says it's wanted", () => {
    const seen = { pointer: vi.fn(), focus: vi.fn(), touch: vi.fn() }
    const cases: Array<[string, (el: HTMLElement) => void, () => void]> = [
      ["pointer", (el) => fireEvent.pointerEnter(el), () => expect(seen.pointer).toHaveBeenCalled()],
      ["focus", (el) => fireEvent.focus(el), () => expect(seen.focus).toHaveBeenCalled()],
      ["touch", (el) => fireEvent.touchStart(el), () => expect(seen.touch).toHaveBeenCalled()],
    ]
    for (const [name, act, check] of cases) {
      render(
        <NodeLink href="/app/doc/trash" onPointerEnter={seen.pointer} onFocus={seen.focus} onTouchStart={seen.touch}>
          {name}
        </NodeLink>,
      )
      const link = screen.getByRole("link", { name })
      expect(link.getAttribute("data-prefetch")).toBe("off")
      act(link)
      expect(link.getAttribute("data-prefetch")).toBe("intent")
      check()
      cleanup()
    }
  })
})
