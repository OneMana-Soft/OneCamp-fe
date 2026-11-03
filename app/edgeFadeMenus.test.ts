import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"
import { describe, expect, it } from "vitest"

// A mask cuts everything drawn in its element to the element's box, for the
// eye and for the pointer, a position: fixed menu too. A strip that fades its
// edges (data-edge-fade, data-edge-fade-block) is masked, so a menu drawn in
// it (New task's chip menus, portalled={false}) showed only what fitted in the
// strip: at 1280, Type's first row, with a click on the rest landing on the
// dialog's overlay (linear-09's LIVE walk, 3 Nov). Every mask the layer puts
// on a strip or a list is lifted while the strip holds a menu Radix placed, by
// components/ui/popoverInStrip.css, which app/globals.css imports, so the
// lift loads on every page the masks do, and costs no page script. The
// browser proof is
// e2e/newTaskChipMenus.

const PLACED = /:has\([^)]*\[data-radix-popper-content-wrapper\][^)]*\)/

/** What stays cut: each mask on a fading strip in `masks` that no rule in `lifts` lifts while the strip holds a placed menu. */
function cutMenus(maskCss: string, liftCss = maskCss): string[] {
  const masks: { attr: string; at: number; selector: string }[] = []
  const lifts: { attrs: string[]; at: number }[] = []
  let at = 0
  const read = (css: string, lift: boolean) => postcss.parse(css).walkRules((rule) => {
    at++
    const value = (prop: string) => rule.nodes.flatMap((n) => (n.type === "decl" && n.prop === prop ? [n.value.trim()] : []))[0]
    const attrs = [...rule.selector.matchAll(/\[(data-edge-fade(?:-block)?)(?:[~|^$*]?=[^\]]*)?\]/g)].map((m) => m[1])
    if (!attrs.length) return
    const mask = value("mask-image"), webkit = value("-webkit-mask-image")
    if (PLACED.test(rule.selector)) {
      if (lift && mask === "none" && webkit === "none") lifts.push({ attrs, at })
      return
    }
    if ((mask && mask !== "none") || (webkit && webkit !== "none")) for (const attr of new Set(attrs)) masks.push({ attr, at, selector: rule.selector })
  })
  read(maskCss, maskCss === liftCss)
  if (liftCss !== maskCss) read(liftCss, true)
  // In one sheet a lift comes after its mask; a sheet of its own outranks the layer's (unlayered, and two attributes).
  return masks.filter((m) => !lifts.some((l) => (maskCss === liftCss ? l.at > m.at : true) && l.attrs.includes(m.attr))).map((m) => `${m.selector} (${m.attr})`)
}

describe("a fading strip never cuts a menu drawn in it", () => {
  it("every mask on a strip or a list in app/interaction.css is lifted while it holds a placed menu, by a sheet every page loads", () => {
    const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8")
    const masks = read("app/interaction.css"), lifts = read("components/ui/popoverInStrip.css")
    expect(cutMenus(masks, lifts), "masked strips that components/ui/popoverInStrip.css doesn't lift (mask-image and -webkit-mask-image none under :has([data-radix-popper-content-wrapper]))").toEqual([])
    expect(read("app/globals.css")).toMatch(/^@import "\.\.\/components\/ui\/popoverInStrip\.css";$/m)
    // The layer does mask strips: a guard over none would pass by itself.
    expect(cutMenus(masks, "").length).toBeGreaterThan(0)
  })

  it("bites (fixtures)", () => {
    const strip = "[data-edge-fade] { -webkit-mask-image: linear-gradient(red, blue); mask-image: linear-gradient(red, blue); }"
    const list = "[data-edge-fade-block] { mask-image: linear-gradient(red, blue); }"
    const lift = ":is([data-edge-fade], [data-edge-fade-block]):has([data-radix-popper-content-wrapper]) { -webkit-mask-image: none; mask-image: none; }"
    expect(cutMenus(`${strip}\n${list}\n${lift}`)).toEqual([])
    // No lift, a lift before the mask, a lift for the strip alone, a lift of the standard property alone.
    expect(cutMenus(`${strip}\n${list}`)).toHaveLength(2)
    expect(cutMenus(`${lift}\n${strip}`)).toHaveLength(1)
    expect(cutMenus(`${strip}\n${list}\n[data-edge-fade]:has([data-radix-popper-content-wrapper]) { -webkit-mask-image: none; mask-image: none; }`)).toEqual(["[data-edge-fade-block] (data-edge-fade-block)"])
    expect(cutMenus(`${strip}\n:is([data-edge-fade]):has([data-radix-popper-content-wrapper]) { mask-image: none; }`)).toHaveLength(1)
    // Inside @supports, as the layer writes it.
    expect(cutMenus(`@supports (animation-timeline: scroll()) { ${strip} }\n${lift}`)).toEqual([])
  })
})
