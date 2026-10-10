import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

import { describe, expect, it } from "vitest"

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
function files(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) files(p, ext, out)
    else if (ext.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(p)
  }
  return out
}

const COMPOSITED = new Set(["transform", "opacity", "translate", "scale", "rotate"])
const LAYOUT =
  /^(width|height|(min|max)-(width|height)|margin(-\w+)?|padding(-\w+)?|top|left|right|bottom|inset(-\w+)?|flex(-\w+)?|grid(-\w+)*|gap|row-gap|column-gap|font-size|line-height|letter-spacing|border(-\w+)?-width|size)$/

// Keyframes allowed a property the compositor doesn't run, with the reason it
// is cheap anyway.
const KEYFRAME_EXCEPTIONS: Record<string, string> = {
  // A 20 px sweep on the AI's "still writing" mark, while it streams: one
  // small element repaints, nothing moves.
  "text-shimmer": "background-position",
}

// Layout motion that predates this guard, by file: progress bars that grow
// their width, players that resize, the doc's collapsible block, a mobile
// drawer. Each is the owning screen's to replace with transform: scaleX for a
// bar, or no transition; the counts may only go down.
const LAYOUT_MOTION_BASELINE: Record<string, number> = {
  "app/guest/p/[token]/page.tsx": 1,
  "components/admin/AIModelsCard.tsx": 1,
  "components/admin/ai/ModelCatalog.tsx": 1,
  "components/admin/ai/ModelInstaller.tsx": 1,
  "components/ai/DocAiAssistantPanel.tsx": 2,
  "components/attachments/videoPlayer.tsx": 1,
  "components/dialog/RecordingPlayerDialog.tsx": 1,
  "components/drawers/dragableDrawer.tsx": 1,
  "components/fileUpload/AudioPlayer.tsx": 1,
  "components/minimal-tiptap/extensions/collapsible/components/collapsible-view.tsx": 1,
  "components/minimal-tiptap/extensions/poll/poll-view.tsx": 1,
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

describe("motion cost", () => {
  it("keyframes animate transform and opacity, nothing that lays the page out", () => {
    const css = ["app", "components"].flatMap((d) => files(join(ROOT, d), /\.css$/))
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
    const tsx = ["app", "components", "hooks", "lib"].flatMap((d) => files(join(ROOT, d), /\.(t|j)sx?$/))
    const over: string[] = []
    for (const file of tsx) {
      const rel = relative(ROOT, file)
      const count = layoutMotion(readFileSync(file, "utf8")).length
      const allowed = LAYOUT_MOTION_BASELINE[rel] ?? 0
      if (count > allowed) over.push(`${rel}: ${count} (allowed ${allowed})`)
    }
    expect(over).toEqual([])
  })

  it("would catch one: the shell's old panel transition and loading bar", () => {
    expect(layoutMotion(`className="transition-[flex-basis] duration-75"`)).toHaveLength(1)
    expect(layoutMotion(`className="will-change-[flex-basis]"`)).toHaveLength(1)
    expect(layoutMotion(`<motion.div initial={{ height: 0 }} />`)).toHaveLength(1)
    expect(layoutMotion(`className="transition-[transform,opacity] hover:-translate-y-px"`)).toHaveLength(0)
    expect(keyframes("@keyframes grow { 0% { width: 0% } 100% { width: 90% } }")[0].props).toEqual(["width"])
  })
})
