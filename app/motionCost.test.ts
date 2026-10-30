import { readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * Motion that costs nothing: what moves, moves by transform and opacity.
 *
 * Those two the compositor animates on its own. A colour or a shadow repaints
 * the element each frame, which is tolerable for a 120 ms hover. Width,
 * height, margins, padding, flex-basis and the like lay the page out again on
 * every frame they run: the right panel opening, the sidebar folding and the
 * loading bar of every request did, and the playful layer (celebrations, hover
 * lifts, bouncing checks) must never add more. scripts/fluidity checks the
 * same thing at runtime, on the 15 interactions it measures.
 *
 *   - every @keyframes animates only transform and opacity, or is listed
 *     below with the reason its property is cheap;
 *   - no transition list, will-change or Motion prop names a layout property,
 *     except where it is counted below. Those counts may only go down.
 */

const ROOT = process.cwd()

const COMPOSITED = new Set(["transform", "opacity", "translate", "scale", "rotate"])
const LAYOUT =
  /^(width|height|(min|max)-(width|height)|margin(-\w+)?|padding(-\w+)?|top|left|right|bottom|inset(-\w+)?|flex(-\w+)?|grid(-\w+)*|gap|row-gap|column-gap|font-size|line-height|letter-spacing|border(-\w+)?-width|size)$/

// Keyframes allowed a property the compositor doesn't run, with the reason it
// is cheap anyway.
const KEYFRAME_EXCEPTIONS: Record<string, string> = {
  // A row that scrolls sideways fades the edge with more past it
  // (app/interaction.css, data-edge-fade): its own scroll drives the two
  // lengths of the mask, not time, and only the mask repaints.
  "ix-fade-s": "--ix-fade-s",
  "ix-fade-e": "--ix-fade-e",
  // A 20 px sweep on the AI's "still writing" mark, while it streams: one
  // small element repaints, nothing moves.
  "text-shimmer": "background-position",
  // The ring in the workspace mark draws itself once a day (design v3, shell
  // S3): one 16px glyph repaints for 600ms.
  "shell-ring-draw": "stroke-dashoffset",
  // The moss check drawing once when a pull to refresh lands (design v3,
  // mobile L4): one 36px glyph repaints for 200ms.
  "ptr-draw": "stroke-dashoffset",
  // A chart's line drawing itself in, once, on first view: one path's dash
  // offset repaints for 480 ms, nothing moves (content.md T18).
  "chart-line-draw": "stroke-dashoffset",
  // A running focus block's hatch drifting (content.md C11): one block
  // repaints its background, nothing moves.
  "calendar-hatch-drift": "background-position",
  // The hub's `draw` (app/hub.css): a ring or the greeting's arc drawn once,
  // 600 ms, on one small SVG. Paint on a few hundred pixels; nothing moves.
  "hub-draw": "stroke-dashoffset",
  // The composer's formatting row (design v3 chat, C40) reveals by clip-path
  // inside room the card already took: nothing lays out, and Chromium clips
  // on the compositor.
  "format-reveal": "clip-path",
  // The work area's tick and arrow draws (work.md §1.3): stroke-dashoffset on
  // a 16 px check or a 1.5 px dependency path. One small path repaints;
  // nothing is laid out.
  "work-tick-draw": "stroke-dashoffset",
  // The work area's landed flash (Atlassian's post-drop acknowledgement): a
  // background fade on the one card or row that moved, once, for 700 ms.
  "work-landed": "background-color",
}

// Layout motion that predates this guard, by file: progress bars that grow
// their width, players that resize, the doc's collapsible block. Each is the
// owning screen's to replace with transform: scaleX for a bar, or no
// transition; the counts may only go down.
const LAYOUT_MOTION_BASELINE: Record<string, number> = {
  "components/ai/DocAiAssistantPanel.tsx": 2,
  "components/attachments/videoPlayer.tsx": 1,
  // The public booking card's width-step between its steps (content.md K01),
  // the one layout motion the spec asks for; still under reduced motion.
  "components/booking/BookingFlow.tsx": 1,
  "components/fileUpload/AudioPlayer.tsx": 1,
  "components/minimal-tiptap/extensions/collapsible/components/collapsible-view.tsx": 1,
  // A poll's bar, a message's and a call's (moved here from chat's poll-view.tsx).
  "components/poll/PollChoices.tsx": 1,
}

function keyframes(css: string): Array<{ name: string; props: string[] }> {
  const out: Array<{ name: string; props: string[] }> = []
  const re = /@keyframes\s+([\w-]+)\s*\{/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    // The block runs to its matching brace.
    let depth = 1
    let i = re.lastIndex
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++
      else if (css[i] === "}") depth--
    }
    const body = css.slice(re.lastIndex, i - 1).replace(/\/\*[\s\S]*?\*\//g, "")
    const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((p) => p[1])
    out.push({ name: m[1], props: [...new Set(props)] })
  }
  return out
}

// Each place a file's motion names a layout property, once per place:
// transition-[...] and will-change-[...] lists, a CSS transition written in a
// style, and the properties a Motion component animates (initial, animate,
// exit, while*).
function layoutMotion(src: string): string[] {
  const found: string[] = []
  const isLayout = (prop: string) => LAYOUT.test(prop.trim())
  for (const m of src.matchAll(/\b(?:transition|will-change)-\[([^\]]+)\]/g)) {
    if (m[1].split(",").some(isLayout)) found.push(m[0])
  }
  for (const m of src.matchAll(/\btransition(?:Property)?:\s*["'`]([^"'`]+)["'`]/g)) {
    if (m[1].split(",").some((part) => isLayout(part.trim().split(/\s+/)[0]))) found.push(`transition: ${m[1]}`)
  }
  for (const m of src.matchAll(/\b(?:initial|animate|exit|whileHover|whileTap|whileInView)=\{\{([^}]*)\}\}/g)) {
    const keys = [...m[1].matchAll(/(?:^|[,{\s])([a-zA-Z]+)\s*:/g)].map((k) => k[1].replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`))
    if (keys.some(isLayout)) found.push(`motion ${m[0].slice(0, 40)}`)
  }
  return found
}

// The rules whose animation a scroll drives (a scroll or view timeline) that
// don't state animation-duration: auto after their animation shorthand. The
// build writes a shorthand out as longhands, the duration it leaves unstated
// as 0s (Lightning CSS), and an animation a scroll drives that lasts 0s has
// finished before it starts: a strip's fades show their ends wherever it is
// scrolled, the start's fade at the start and none at the end.
function scrollDrivenWithoutDuration(css: string): string[] {
  const found: string[] = []
  for (const m of css.matchAll(/([^{}]*)\{([^{}]*animation-timeline:\s*(?:scroll|view)\([^{}]*)\}/g)) {
    const shorthand = m[2].search(/(?:^|[;\s])animation:/)
    const duration = m[2].search(/animation-duration:\s*auto\b/)
    if (duration < 0 || duration < shorthand) found.push(m[1].trim().split("\n").pop()!.trim())
  }
  return found
}

describe("motion cost", () => {
  it("keyframes animate transform and opacity, nothing that lays the page out", () => {
    const css = sourceFiles(["app", "components"], /\.css$/)
    const wrong: string[] = []
    for (const file of css) {
      for (const k of keyframes(readFileSync(file, "utf8"))) {
        const allowed = KEYFRAME_EXCEPTIONS[k.name]
        const bad = k.props.filter((p) => !COMPOSITED.has(p) && p !== allowed)
        if (bad.length) wrong.push(`${relative(ROOT, file)} @keyframes ${k.name}: ${bad.join(", ")}`)
      }
    }
    expect(wrong).toEqual([])
  })

  it("no new transition, will-change or Motion prop animates layout", () => {
    const tsx = sourceFiles(["app", "components", "hooks", "lib"], /\.(t|j)sx?$/)
    const over: string[] = []
    for (const file of tsx) {
      const rel = relative(ROOT, file)
      const count = layoutMotion(readFileSync(file, "utf8")).length
      const allowed = LAYOUT_MOTION_BASELINE[rel] ?? 0
      if (count > allowed) over.push(`${rel}: ${count} (allowed ${allowed})`)
    }
    expect(over).toEqual([])
  })

  it("lifts a card on the compositor: translate, and a shadow that fades in", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    const at = css.indexOf("@utility hover-lift {")
    expect(at, "hover-lift is defined").toBeGreaterThan(-1)
    let depth = 0
    let end = at
    for (let i = css.indexOf("{", at); i < css.length; i++) {
      if (css[i] === "{") depth++
      else if (css[i] === "}" && --depth === 0) {
        end = i
        break
      }
    }
    const lift = css.slice(at, end)
    // What it transitions: translate on the card, opacity on its shadow layer.
    const props = [...lift.matchAll(/transition(?:-property)?:\s*([^;]+);/g)].flatMap((m) => m[1].split(",").map((p) => p.trim().split(/\s+/)[0]))
    expect(props.length).toBeGreaterThan(0)
    for (const p of props) expect(["translate", "transform", "opacity"]).toContain(p)
    // The bigger shadow is drawn once, not animated.
    expect(lift).not.toMatch(/&:hover\s*\{[^}]*box-shadow/)
  })

  it("bursts a celebration with transform and opacity only", () => {
    // The bursts, and the springy check beside them.
    const src = ["lib/celebrate.ts", "lib/spring.ts"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n")
    const frames = [...src.matchAll(/\{\s*(transform|scale|opacity|offset)[^{}]*\}/g)].map((m) => m[0])
    expect(frames.length).toBeGreaterThan(0)
    for (const f of frames) {
      const keys = [...f.matchAll(/([a-zA-Z]+)\s*:/g)].map((m) => m[1])
      for (const k of keys) expect(["transform", "opacity", "offset", "scale", "rotate", "translate", "easing"]).toContain(k)
    }
  })

  it("an animation a scroll drives lasts its whole scroll: animation-duration auto, after the shorthand", () => {
    const css = sourceFiles(["app", "components"], /\.css$/)
    const all = css.map((file) => readFileSync(file, "utf8")).join("\n")
    expect(all).toMatch(/animation-timeline:\s*scroll\(/)
    const wrong = css.flatMap((file) => scrollDrivenWithoutDuration(readFileSync(file, "utf8")).map((rule) => `${relative(ROOT, file)} ${rule}`))
    expect(wrong).toEqual([])
  })

  it("would catch one: the shell's old panel transition and loading bar", () => {
    expect(layoutMotion(`className="transition-[flex-basis] duration-75"`)).toHaveLength(1)
    expect(layoutMotion(`className="will-change-[flex-basis]"`)).toHaveLength(1)
    expect(layoutMotion(`<motion.div initial={{ height: 0 }} />`)).toHaveLength(1)
    expect(layoutMotion(`className="transition-[transform,opacity] hover:-translate-y-px"`)).toHaveLength(0)
    expect(keyframes("@keyframes grow { 0% { width: 0% } 100% { width: 90% } }")[0].props).toEqual(["width"])
    expect(scrollDrivenWithoutDuration(".a { animation: f linear both; animation-timeline: scroll(self); }")).toEqual([".a"])
    expect(scrollDrivenWithoutDuration(".a { animation-duration: auto; animation: f linear both; animation-timeline: scroll(self); }")).toEqual([".a"])
    expect(scrollDrivenWithoutDuration(".a { animation: f linear both; animation-duration: auto; animation-timeline: scroll(self); }")).toEqual([])
  })
})
