import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
/**
 * Every icon-only control must have an accessible name.
 *
 * A button whose only child is an icon has no text, so a screen reader announces
 * it as "button" and nothing else. On a surface like the mobile top bar — which
 * was thirteen such buttons, all of them Ellipsis or Filter or Plus — that
 * produced a row of controls indistinguishable from one another. The same gap hid
 * what the destructive ones did: delete-event, unlink-repository, remove-action
 * and cancel-upload all announced as plain "button".
 *
 * 73 of these were found and 70 named. The two that remain are deliberate and
 * enumerated in ALLOWED below. (A third was a <Button> with no handler inside a
 * commented-out dropdown; that control was dead, so it was replaced with a real
 * link rather than labelled — which is why the honesty check below matters as
 * much as the count: it forces a stale allowance to be removed.)
 *
 * The check is a ratchet, like the status-colour one: the count may fall freely
 * and any rise fails. It is deliberately conservative — it only reports a button
 * when the body contains JSX elements, contains no `{expression}` that could
 * supply text at runtime, and contains no letters outside tags. That means it
 * cannot flag a button whose label arrives through a variable, so it will miss
 * some real cases; the alternative is false positives, which would make the test
 * something people learn to skip.
 *
 * Accepted sources of a name: aria-label, aria-labelledby, title, or visible text
 * including an sr-only span. A tooltip is NOT accepted — TooltipContent renders
 * into a portal and is not wired to the trigger as its name.
 */
const root = resolve(__dirname, "..")
const NAME_ATTRS = ["aria-label", "aria-labelledby", "title="]
/**
 * Known and intentional. Each entry is a file plus the count it may contribute,
 * so a NEW unnamed button in one of these files still fails.
 */
const ALLOWED: Record<string, number> = {
  // Button nested inside a <Link aria-label="View recordings">. The link is the
  // element the reader announces, and it is named.
  "components/channel/chanelIdDesktop.tsx": 1,
  "components/chat/chatIdDesktop.tsx": 1,
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full)
    }
  }
  return out
}
/** End index of the open tag, honouring nested braces and quotes. */
function endOfOpenTag(src: string, from: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = from; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === quote) quote = null
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c
    } else if (c === "{") {
      depth++
    } else if (c === "}") {
      depth--
    } else if (c === ">" && depth === 0) {
      return i
    }
  }
  return src.length - 1
}
/** Inner markup of the element, or "" when self-closing. */
function innerOf(src: string, closeIdx: number, tag: string): string {
  if (src[closeIdx - 1] === "/") return ""
  const pat = new RegExp(`</?${tag}(\\s|>|/)`, "g")
  let depth = 1
  const start = closeIdx + 1
  pat.lastIndex = start
  let m: RegExpExecArray | null
  while ((m = pat.exec(src))) {
    if (src[m.index + 1] === "/") {
      depth--
      if (depth === 0) return src.slice(start, m.index)
    } else {
      depth++
    }
  }
  return src.slice(start)
}
function unnamedIconButtons(src: string): number {
  let count = 0
  const open = /<(Button|button|IconButton)(\s|>)/g
  let m: RegExpExecArray | null
  while ((m = open.exec(src))) {
    const closeIdx = endOfOpenTag(src, m.index)
    const openTag = src.slice(m.index, closeIdx + 1)
    const inner = innerOf(src, closeIdx, m[1])
    if (NAME_ATTRS.some((a) => openTag.includes(a))) continue
    if (inner.includes("aria-label") || inner.includes("sr-only")) continue
    // A runtime expression could be the label, so this is not a confident finding.
    if (inner.includes("{")) continue
    // Any letters outside of tags are visible text, which is a name.
    if (/[A-Za-z]/.test(inner.replace(/<[^>]*>/g, " "))) continue
    // Must actually render something, i.e. an icon component.
    if (!/<[A-Z][A-Za-z0-9]*/.test(inner)) continue
    count++
  }
  return count
}
const files = [...walk(resolve(root, "components")), ...walk(resolve(root, "app"))]
describe("icon-only controls have accessible names", () => {
  it("has no unnamed icon-only button outside the enumerated allowances", () => {
    const offenders: string[] = []
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      const found = unnamedIconButtons(readFileSync(file, "utf8"))
      const allowed = ALLOWED[rel] ?? 0
      if (found > allowed) {
        offenders.push(`${rel}: ${found} unnamed (allowed ${allowed})`)
      }
    }
    expect(
      offenders,
      "Give each icon-only button an aria-label describing what it does, e.g. " +
        'aria-label="Delete event". A tooltip is not a name.',
    ).toEqual([])
  })
  it("keeps the allowance list honest, so stale entries get removed", () => {
    for (const [rel, allowed] of Object.entries(ALLOWED)) {
      const found = unnamedIconButtons(readFileSync(resolve(root, rel), "utf8"))
      expect(
        found,
        `${rel} is allowed ${allowed} but now has ${found}; update or drop the entry`,
      ).toBe(allowed)
    }
  })
})
