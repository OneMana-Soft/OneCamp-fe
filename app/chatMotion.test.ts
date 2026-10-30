import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * Chat's motion (design v3 chat, §1.3 and §4.3). Every chat keyframe moves by
 * transform and opacity only; every looping attention-getter in a
 * conversation (bounce, ping, pulse) is behind motion-safe; each motion token
 * the conversation uses exists with its duration; and the ones that move have
 * a reduced-motion pair (a short fade).
 */
const CSS = readFileSync(join(__dirname, "globals.css"), "utf8")
const CHAT_KEYFRAMES = ["msg-in", "msg-in-own", "row-out", "pill-in", "react-pop", "react-out", "count-in", "count-out", "panel-in", "pop-in", "glow-settle", "typing-bob", "orbit-in", "orbit-in-counter", "twinkle", "live-halo", "nudge", "line-draw", "indeterminate", "clock-hand", "empty-out", "fade-in"]
const COMPOSITED = new Set(["transform", "opacity", "scale", "translate", "rotate"])

function keyframe(name: string): string {
  const at = CSS.indexOf(`@keyframes ${name} {`)
  expect(at, `@keyframes ${name}`).toBeGreaterThan(-1)
  let depth = 0
  for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
    if (CSS[i] === "{") depth++
    else if (CSS[i] === "}" && --depth === 0) return CSS.slice(at, i)
  }
  return ""
}

const CHAT_DIRS = ["components/message", "components/rightPanel", "components/textInput", "components/typingIndicator", "components/MessageDesktopHover", "components/channel", "components/chat", "components/groupChat", "components/reactionPicker", "components/messages"]

describe("chat motion", () => {
  it.each(CHAT_KEYFRAMES)("%s moves by transform and opacity only", (name) => {
    const body = keyframe(name).replace(/\/\*[\s\S]*?\*\//g, "")
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])
    expect(props.length).toBeGreaterThan(0)
    for (const p of props) expect(COMPOSITED, `${name}: ${p}`).toContain(p)
  })

  it("fades the hover toolbar in, so More is where it rests from its first frame", () => {
    // A click target never moves under the pointer. The toolbar entered by 2px and .98 for
    // 120 ms, and a click checked inside that window met a moving More (CALLS-LEAD-23, 27 Oct).
    expect(CSS).toMatch(/--animate-toolbar-in: fade-in 120ms /)
    const body = keyframe("fade-in").replace(/\/\*[\s\S]*?\*\//g, "")
    expect([...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1])).toEqual(["opacity", "opacity"])
  })

  it("times the tokens as the spec says", () => {
    expect(CSS).toMatch(/--animate-msg-in: msg-in 200ms/)
    expect(CSS).toMatch(/--animate-msg-in-own: msg-in-own 220ms/)
    expect(CSS).toMatch(/--animate-react-pop: react-pop 220ms cubic-bezier\(0\.3, 1\.35, 0\.5, 1\)/)
    expect(CSS).toMatch(/--animate-panel-in: panel-in 240ms cubic-bezier\(0\.65, 0, 0\.35, 1\)/)
    expect(CSS).toMatch(/--animate-pill-in: pill-in 180ms/)
    expect(CSS).toMatch(/--animate-glow-settle: glow-settle 900ms/)
    expect(CSS).toMatch(/--animate-typing-bob: typing-bob 1\.2s/)
  })

  it("gives what moves a reduced-motion fade, and stills the typing dots", () => {
    // The chat's own reduced-motion block: other waves append blocks of their
    // own after it, so it is found by what it holds, not by being the last.
    const blocks = CSS.split("@media (prefers-reduced-motion: reduce) {").slice(1).map((b) => b.slice(0, b.indexOf("\n}")))
    const reduced = blocks.find((b) => b.includes(".animate-msg-in")) ?? ""
    for (const c of ["msg-in", "msg-in-own", "panel-in", "pill-in", "pop-in", "toolbar-in"]) expect(reduced).toContain(`.animate-${c}`)
    expect(reduced).toMatch(/\.animate-typing-bob \{[^}]*animation: none !important/)
  })

  it("keeps bounce, ping and pulse out of a conversation unless motion-safe", () => {
    const wrong: string[] = []
    for (const f of sourceFiles(CHAT_DIRS, /\.tsx?$/)) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/(\S*)animate-(bounce|ping|pulse)\b/g)) if (!m[1].endsWith("motion-safe:")) wrong.push(`${f}: ${m[0]}`)
    }
    expect(wrong).toEqual([])
  })

  it("draws the floating material as one class: the pop surface at e3, r12", () => {
    const at = CSS.indexOf("@utility pop-surface {")
    const block = CSS.slice(at, CSS.indexOf("}", at))
    expect(block).toMatch(/background-color:\s*var\(--pop\)/)
    expect(block).toMatch(/box-shadow:\s*var\(--e3\)/)
    expect(block).toMatch(/border-radius:\s*12px/)
  })
})
