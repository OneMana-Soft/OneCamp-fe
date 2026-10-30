import { expect, test, type Locator, type Page } from "@playwright/test"

import { finger } from "./finger"
import { expectReachable } from "./menuReach"

/**
 * How a phone sheet (components/ui/drawer) lays out, measured in the browser,
 * for the rules every sheet keeps (design v3, mobile C5):
 *
 *   - One scroller. The sheet's body is the one thing that scrolls up and
 *     down, and a sheet that fits what it holds doesn't scroll at all;
 *     nothing inside it is a second scroller with a height cap of its own
 *     (two scroll bars, and a flick that moves the wrong one).
 *   - Nothing runs sideways. A box that scrolls up and down can scroll
 *     sideways too (an overflow that isn't visible turns the other axis to
 *     auto), so content a few px too wide gave the status sheet a sideways
 *     bar. A row meant to scroll sideways (a bar of chips) says so: it
 *     scrolls only sideways (overflow-y hidden or clip).
 *   - No modal over a sheet: the next step happens in the sheet itself, or in
 *     a sheet of its own over it, whose scrim then lies over the one below.
 *   - As tall as what it holds: no empty slab under the content.
 *   - Nothing cut off at a scroller's edge: a field's 4px halo, a focus ring.
 *   - Nothing squashed: a section of the sheet stands at its own height, and
 *     the body scrolls past it. A flex column that shrinks its children to
 *     fit cut the share sheet's General access to a 12px sliver on a phone
 *     held sideways (DESIGN-BUILD-3, 20 Oct 2026).
 *   - Nothing written on it by script that outlives its moment (vaul's input
 *     repositioning left a height and a bottom once the keyboard went).
 */
export interface SheetLayout {
  /** The detent the sheet declares (menu, medium, half, large). */
  detent: string
  /** The sheet's own height, its cap, and the visible screen's, in px. */
  height: number
  cap: number
  viewport: number
  /** Empty space between the bottom of what the sheet shows and its own bottom edge, in px (the home-indicator strip excluded). */
  emptyBelow: number
  /** Things in the sheet that scroll up and down now: more content than room. */
  vertical: string[]
  /** Things in the sheet with a height cap of their own that scroll up and down: a nested list, whether or not it is full at this size. */
  nested: string[]
  /** Things whose content runs past the sides of a box that scrolls up and down (where a finger would pan it sideways, or it clips). */
  sideways: string[]
  /** Whether the page behind is pushed back as a card (a large sheet). */
  pageScaled: boolean
  /** Fields whose 4px halo would pass the edge of the box that clips them (a scroller, the sheet), with the px short. */
  clipped: string[]
  /** What script has written on the sheet's own height and bottom. */
  inline: { height: string; bottom: string }
  /** Boxes a flex column squeezed below their content: what they hold, in the flow, runs past their bottom (cut off or spilling). */
  squashed: string[]
  /** Pinned parts (the header, the footer) the body runs under with no fill of their own: what scrolls shows through them, cut at a line. */
  seeThrough: string[]
}

/**
 * A phone's long press on `target` (hooks/useLongPress), by real touch: a
 * finger held 20px in from its left edge, at its middle, until `shown` is up,
 * then lifted. No fixed wait: the hold lasts as long as the sheet takes.
 */
export async function holdUntil(page: Page, target: Locator, shown: Locator): Promise<void> {
  // A press that a scroll ends (useLongPress: a list still settling scrolls
  // under a held finger) is let go with touchcancel, never a tap, and made
  // again where the target rests now; each miss logs the scrolls it saw.
  for (let attempt = 1; ; attempt++) {
    let box = await target.boundingBox()
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(100)
      const next = await target.boundingBox()
      const still = !!box && !!next && box.x === next.x && box.y === next.y && box.height === next.height
      box = next
      if (still) break
    }
    if (!box) throw new Error("holdUntil: the target isn't drawn")
    const at = { x: Math.round(box.x + 20), y: Math.round(box.y + box.height / 2) }
    // The finger goes down only where the target takes it: what is drawn at
    // the point is the target. A virtualised list (virtua) lets every touch
    // through its rows for 150 ms after each scroll, and a list settling after
    // it loads scrolls without moving a row (its measure keeps the rows in
    // place), so a still box was no sign: the press went to the list's own
    // box and opened nothing. virtua ends a touch only on touchend, so after
    // the touchcancel below it let every touch through, and the next presses
    // missed too (3 of 40 runs at 390, 25 Oct 2026).
    await expect
      .poll(
        () =>
          target.evaluate((el, p) => {
            const hit = document.elementFromPoint(p.x, p.y)
            if (!hit) return "nothing"
            return hit === el || el.contains(hit) ? "the target" : `<${hit.tagName.toLowerCase()} class="${String(hit.getAttribute("class") ?? "").slice(0, 60)}">`
          }, at),
        { message: `what a finger at ${at.x},${at.y} meets`, timeout: 10_000 },
      )
      .toBe("the target")
    await page.evaluate(() => {
      const w = window as unknown as { __holdScrolls: number }
      w.__holdScrolls = 0
      window.addEventListener("scroll", () => void w.__holdScrolls++, { capture: true, passive: true })
    })
    const cdp = await page.context().newCDPSession(page)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
    const up = await shown.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false)
    await cdp.send("Input.dispatchTouchEvent", { type: up ? "touchEnd" : "touchCancel", touchPoints: [] })
    await cdp.detach()
    if (up) return
    const scrolls = await page.evaluate(() => (window as unknown as { __holdScrolls: number }).__holdScrolls)
    console.log(`holdUntil: press ${attempt} at ${at.x},${at.y} opened nothing; ${scrolls} scroll events while held`)
    if (attempt === 3) throw new Error(`holdUntil: three presses opened nothing (last saw ${scrolls} scroll events)`)
  }
}

/** The sheet on top: the last one open. */
export function topSheet(page: Page): Locator {
  return page.locator('[data-vaul-drawer][data-state="open"]').last()
}

/** `el` has stopped moving, a sheet's rise or a growth done: the same box for six frames. */
export function settled(el: Locator): Promise<void> {
  return el.evaluate(
    (node) =>
      new Promise<void>((done) => {
        let last = ""
        let same = 0
        const frame = () => {
          const r = node.getBoundingClientRect()
          const box = `${r.x} ${r.y} ${r.width} ${r.height}`
          same = box === last ? same + 1 : 0
          last = box
          if (same >= 6) done()
          else requestAnimationFrame(frame)
        }
        requestAnimationFrame(frame)
      }),
  )
}

/** Measures `sheet` (a [data-vaul-drawer]) as SheetLayout. */
export async function sheetLayout(sheet: Locator): Promise<SheetLayout> {
  return sheet.evaluate((root: HTMLElement) => {
    const name = (el: Element) => {
      const h = el as HTMLElement
      const tag = h.tagName.toLowerCase()
      const label = h.getAttribute("aria-label") || h.getAttribute("role") || ""
      const data = Array.from(h.attributes)
        .filter((a) => a.name.startsWith("data-") && !a.name.startsWith("data-state") && a.name !== "data-press")
        .map((a) => `[${a.name}]`)
        .slice(0, 2)
        .join("")
      const cls = (h.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 4).join(".")
      return `${tag}${data}${label ? `"${label}"` : ""}${cls ? `.${cls}` : ""}`
    }
    const scrolls = (v: string) => v === "auto" || v === "scroll"
    const field = (el: Element) => el.matches("input, textarea, select, [contenteditable='true'], [contenteditable='']")
    const body = root.querySelector<HTMLElement>(":scope > [data-sheet-body]") ?? Array.from(root.children).reverse().find((c) => scrolls(getComputedStyle(c).overflowY)) ?? null
    const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]

    const vertical: string[] = []
    const nested: string[] = []
    const sideways: string[] = []
    for (const el of all) {
      const s = getComputedStyle(el)
      if (s.display === "none" || field(el)) continue
      if (!scrolls(s.overflowY)) continue
      if (el.scrollHeight > el.clientHeight + 1) vertical.push(name(el))
      if (el !== body && el !== root && s.maxHeight !== "none") nested.push(name(el))
      // Its content's own boxes against its sides (a control's reach, a
      // ::before, is no box of its own); what a box inside clips is that
      // box's to keep, and a row meant to go sideways is one.
      const box = el.getBoundingClientRect()
      const left = box.left + el.clientLeft
      const right = left + el.clientWidth
      const past: string[] = []
      for (const d of Array.from(el.querySelectorAll<HTMLElement>("*"))) {
        let clipped = false
        for (let a = d.parentElement; a && a !== el; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== "visible") {
            clipped = true
            break
          }
        }
        if (clipped) continue
        const r = d.getBoundingClientRect()
        if (r.width === 0 || r.height === 0 || getComputedStyle(d).position === "fixed") continue
        if (r.left < left - 1 || r.right > right + 1) past.push(`${name(d)} ${Math.round(r.left - left)}..${Math.round(r.right - right)}`)
      }
      if (past.length) sideways.push(`${name(el)}: ${past.slice(0, 3).join(", ")}`)
    }

    const box = root.getBoundingClientRect()
    const padBottom = parseFloat(getComputedStyle(root).paddingBottom) || 0
    let contentBottom = box.top
    for (const el of Array.from((body ?? root).querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const s = getComputedStyle(el)
      if (s.visibility === "hidden" || s.position === "fixed") continue
      contentBottom = Math.max(contentBottom, Math.min(r.bottom, box.bottom))
    }
    // A field's halo is 4px of box-shadow (--ix-halo): it shows only inside
    // every box that clips the field (each ancestor whose overflow isn't
    // visible, the sheet included) and inside the screen's own sides.
    const clipped: string[] = []
    const HALO = 4
    for (const f of Array.from(root.querySelectorAll<HTMLElement>(".field-surface, .hub-field, input:not([type='hidden']):not(.sr-only), textarea"))) {
      const r = f.getBoundingClientRect()
      const frame = f.parentElement?.closest(".hub-field, .field-surface")
      if (r.width === 0 || r.height === 0 || frame) continue
      const edges: { by: string; left: number; right: number }[] = [{ by: "the screen", left: 0, right: window.innerWidth }]
      for (let a: HTMLElement | null = f.parentElement; a; a = a === root ? null : a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflowX === "visible" && s.overflowY === "visible") continue
        const c = a.getBoundingClientRect()
        edges.push({ by: name(a), left: c.left + a.clientLeft, right: c.left + a.clientLeft + a.clientWidth })
      }
      for (const e of edges) {
        const short = Math.min(r.left - HALO - e.left, e.right - (r.right + HALO))
        if (short < -0.5) clipped.push(`${name(f)} by ${e.by}: ${Math.round(short)}px`)
      }
    }
    const squashed: string[] = []
    for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
      const parent = el.parentElement
      if (!parent || field(el)) continue
      const s = getComputedStyle(el)
      const p = getComputedStyle(parent)
      if (!/flex/.test(p.display) || !p.flexDirection.startsWith("column") || s.display === "none" || s.display === "contents") continue
      if (scrolls(s.overflowY) || (s.webkitLineClamp && s.webkitLineClamp !== "none")) continue
      // Its own boxes in the flow, not a positioned one or a control's 44px reach (a ::before).
      const bottom = el.getBoundingClientRect().bottom
      const past = Array.from(el.children).filter((c) => {
        const cs = getComputedStyle(c)
        const r = c.getBoundingClientRect()
        return cs.position !== "absolute" && cs.position !== "fixed" && r.height > 0 && r.bottom > bottom + 2
      })
      if (past.length) squashed.push(`${name(el)}: ${past.slice(0, 2).map((c) => `${name(c)} ${Math.round(c.getBoundingClientRect().bottom - bottom)}px past`).join(", ")}`)
    }
    // Under a finger the body runs under the pinned footer by its finger
    // room (app/phone.css), so a part it runs under needs a fill of its own.
    const alphaOf = (c: string) => {
      if (c === "transparent") return 0
      const slash = c.match(/\/\s*([\d.]+)(%?)\s*\)$/)
      if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1)
      const rgba = c.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+)\s*\)$/)
      return rgba ? parseFloat(rgba[1]) : 1
    }
    const seeThrough: string[] = []
    if (body) {
      const b = body.getBoundingClientRect()
      for (const part of Array.from(root.querySelectorAll<HTMLElement>(":scope > [data-sheet-header], :scope > [data-sheet-footer]"))) {
        const r = part.getBoundingClientRect()
        const under = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top)
        const own = getComputedStyle(part).backgroundColor
        if (under > 0.5 && alphaOf(own) < 1) seeThrough.push(`${name(part)} over ${Math.round(under)}px of the body: its fill is ${own}`)
      }
    }
    const wrapper = document.querySelector<HTMLElement>("[data-vaul-drawer-wrapper]")
    const cap = parseFloat(getComputedStyle(root).maxHeight)
    return {
      detent: root.getAttribute("data-detent") ?? "",
      height: Math.round(box.height),
      cap: Number.isFinite(cap) ? Math.round(cap) : Infinity,
      viewport: Math.round(window.visualViewport?.height ?? window.innerHeight),
      emptyBelow: Math.max(0, Math.round(box.bottom - padBottom - contentBottom)),
      vertical,
      nested,
      sideways,
      pageScaled: !!wrapper && /scale\(/.test(wrapper.style.transform),
      clipped,
      inline: { height: root.style.height, bottom: root.style.bottom },
      squashed,
      seeThrough,
    }
  })
}

/**
 * What is laid over an open sheet: Radix dialogs that aren't sheets (a
 * modal), and popovers (a floating box; a phone's field opens a sheet of its
 * own instead). A dialog or a confirm drawn as a sheet (components/ui/dialog,
 * alert-dialog: data-v3-sheet) is a sheet of its own. Empty while no sheet is
 * open.
 */
export async function layersOverSheet(page: Page): Promise<{ modals: string[]; popovers: string[] }> {
  return page.evaluate(() => {
    const out = { modals: [] as string[], popovers: [] as string[] }
    if (!document.querySelector('[data-vaul-drawer][data-state="open"]')) return out
    const named = (d: HTMLElement) => d.getAttribute("aria-label") || d.querySelector("h2")?.textContent?.trim() || d.className.split(/\s+/).slice(0, 3).join(".")
    for (const d of Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'))) {
      if (d.hasAttribute("data-vaul-drawer") || d.hasAttribute("data-v3-sheet")) continue
      if (d.closest("[data-radix-popper-content-wrapper]")) out.popovers.push(named(d))
      else out.modals.push(named(d))
    }
    return out
  })
}

/**
 * With a layer open over another (a sheet, a dialog or a confirm, in any
 * order): whether the top layer's scrim is painted over the layer under it
 * (dimming it, as the page is), by their stacking: z-index, then the order
 * they come in. Null with fewer than two open.
 */
export async function scrimOverLayerBelow(page: Page): Promise<boolean | null> {
  return page.evaluate(() => {
    const open = Array.from(document.querySelectorAll<HTMLElement>(':is([data-vaul-drawer], .v3-dialog, .v3-sheet)[data-state="open"]'))
    if (open.length < 2) return null
    const lower = open[open.length - 2]
    const scrim = Array.from(document.querySelectorAll<HTMLElement>("[data-vaul-overlay], .v3-overlay")).pop()
    if (!scrim) return false
    const z = (el: HTMLElement) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0
    if (z(scrim) !== z(lower)) return z(scrim) > z(lower)
    return !!(lower.compareDocumentPosition(scrim) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
}

/** A scrim over another layer, lighter than the page's as the page is dimmed already (app/phone.css), by theme. */
export const LAYERED_SCRIM = { light: "rgba(10, 11, 14, 0.2)", dark: "rgba(0, 0, 0, 0.4)" } as const

/** The top scrim's computed fill, or null with none open. */
export async function topScrimFill(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const scrim = Array.from(document.querySelectorAll<HTMLElement>("[data-vaul-overlay], .v3-overlay")).pop()
    return scrim ? getComputedStyle(scrim).backgroundColor : null
  })
}

/** A pinned footer: a dialog's (components/ui/dialog) or a drawer's (components/ui/drawer). */
const FOOTERS = "[data-dialog-footer], [data-sheet-footer]"

/**
 * An overlay with more to show than its room scrolls in its body alone: a
 * dialog (components/ui/dialog, a sheet of its own on a phone; app/overlay.css,
 * rule 1) or a drawer (components/ui/drawer, whose own body scrolls). The
 * window is made shorter until a box in `overlay` has more than its room, as
 * a phone's keyboard or a short laptop window does, and the outermost such
 * box is scrolled to its end: by a finger on a touch screen, by the wheel
 * otherwise. Then the overlay itself has not scrolled, and its title, a
 * dialog's corner close and every control in its footer are each in view and
 * the top thing at their middle. The header draws its hairline only once the
 * body has more above, and what the header holds keeps room over the body's
 * top edge, where scrolled rows are cut (the test's "top room" annotation): a
 * drawer's rows scrolled up to 2px under its description, with no line
 * between (25 Oct 2026). And the body's last row shows in full: nothing
 * covers its foot, the footer keeps its own content inside its box, and the
 * row ends above the footer and the fade over its top edge (app/phone.css);
 * the gap is the test's "end room" annotation. The window stays short and the
 * overlay at its end, for a shot.
 */
export async function scrollsInItsBody(page: Page, overlay: Locator): Promise<void> {
  // The outermost box with more than its room, the overlay first: where a gesture over it goes, or null.
  const overflowing = () =>
    overlay.evaluate((root) => {
      const box = [root, ...Array.from(root.querySelectorAll("*"))].find(
        (el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1,
      )
      if (!box) return null
      const r = box.getBoundingClientRect()
      return { x: r.x + r.width / 2, from: r.y + r.height * 0.8, to: r.y + r.height * 0.2 }
    })
  // The header's hairline (app/overlay.css, rule 4), by its shadow.
  const hairline = () =>
    overlay.evaluate((root) => {
      const header = root.querySelector("[data-overlay-header]")
      return header ? getComputedStyle(header).boxShadow : "no header"
    })
  const { width, height } = page.viewportSize()!
  await settled(overlay)
  let at = await overflowing()
  let h = height
  while (!at) {
    h = Math.round(h * 0.85)
    expect(h, "a window short enough for the overlay's content to have more than its room").toBeGreaterThanOrEqual(280)
    await page.setViewportSize({ width, height: h })
    await settled(overlay)
    at = await overflowing()
  }
  expect.soft(await hairline(), "the header's hairline while the body is at its top").toBe("none")
  const { x, from, to } = at
  const hand = (await page.evaluate(() => navigator.maxTouchPoints > 0)) ? await finger(page) : null
  // Where the box under the gesture stands: the nearest one round that point that scrolls.
  const scroller = () =>
    page.evaluate(
      ([px, py]) => {
        for (let el = document.elementFromPoint(px, py); el; el = el.parentElement)
          if (/auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1)
            return el.scrollTop + el.clientHeight >= el.scrollHeight - 1 ? "at its end" : "more below"
        return "nothing scrolls there"
      },
      [x, (from + to) / 2],
    )
  await expect(async () => {
    if ((await scroller()) === "more below") {
      if (hand) {
        await hand.down(x, from)
        for (let k = 1; k <= 8; k++) await hand.move(x, from + ((to - from) * k) / 8)
        await hand.up()
      } else {
        await page.mouse.move(x, (from + to) / 2)
        await page.mouse.wheel(0, (from - to) * 2)
      }
    }
    expect(await scroller()).toBe("at its end")
  }).toPass({ timeout: 30_000 })
  expect(await overlay.evaluate((root) => root.scrollTop), "the overlay scrolled itself, not its body").toBe(0)
  await expectReachable(overlay.getByRole("heading").first())
  const close = overlay.locator(":scope > button", { hasText: "Close" })
  if (await close.count()) await expectReachable(close)
  for (const control of await overlay.locator(FOOTERS).locator("button:visible, a:visible").all()) await expectReachable(control)
  await expect.configure({ soft: true }).poll(hairline, { message: "the header's hairline while the body has more above" }).not.toBe("none")
  // The last row is the lowest ink in the body: a box's border or fill, a leaf, or else a box's content without
  // its padding. At 390 the plan's last select and AI activity's last entry ended half under the stacked buttons
  // of a footer squeezed to its 60px floor, which spilled up out of its box (25 Oct 2026).
  const end = await overlay.evaluate((root, footers) => {
    const body = [root, ...Array.from(root.querySelectorAll("*"))].find(
      (el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1,
    )!
    const name = (el: Element | null) =>
      el ? `<${el.tagName.toLowerCase()} class="${String(el.getAttribute("class") ?? "").slice(0, 60)}"> "${(el.textContent ?? "").trim().slice(0, 40)}"` : "nothing"
    const ink = (el: Element) => {
      const r = el.getBoundingClientRect()
      const s = getComputedStyle(el)
      if (r.width <= 2 || r.height <= 2 || s.visibility !== "visible") return -Infinity
      const painted = !el.children.length || parseFloat(s.borderBottomWidth) > 0 || s.backgroundColor !== "rgba(0, 0, 0, 0)"
      let bottom = painted ? r.bottom : r.bottom - parseFloat(s.paddingBottom)
      // What a box inside the body clips isn't drawn: a Home needs row's one-line box clips the second line its
      // project yields to (components/home/needsRow), and at 1280 that line was taken for the last row's foot.
      for (let box = el.parentElement; box && box !== body && box !== root; box = box.parentElement) {
        const b = getComputedStyle(box)
        if (b.overflowX === "visible" && b.overflowY === "visible") continue
        const clip = box.getBoundingClientRect().bottom
        if (r.top >= clip) return -Infinity
        bottom = Math.min(bottom, clip)
      }
      return bottom
    }
    const all = Array.from(body.querySelectorAll("*"))
    const lowest = Math.max(...all.map(ink))
    const row = all.filter((el) => ink(el) >= lowest - 1).at(-1)!
    const foot = ink(row)
    // Just inside the row's foot, across the body: what is drawn there is the body's.
    const b = body.getBoundingClientRect()
    const over = [0.25, 0.5, 0.75]
      .map((f) => document.elementFromPoint(b.left + b.width * f, foot - 2))
      .filter((at) => !at || !body.contains(at))
      .map(name)
    const footer = root.querySelector(footers)
    const top = footer?.getBoundingClientRect().top
    const parts = footer ? Array.from(footer.querySelectorAll("*")).map((el) => el.getBoundingClientRect().top) : []
    // The header's lowest ink (its title, or the description under it) over the body's top edge.
    const header = root.querySelector("[data-overlay-header]")
    const head = header ? Math.max(...Array.from(header.querySelectorAll("*")).map(ink)) : -Infinity
    return {
      row: name(row),
      over,
      spill: top === undefined || !parts.length ? null : Math.round(top - Math.min(...parts)),
      gap: top === undefined ? null : Math.round(top - foot),
      fade: footer ? parseFloat(getComputedStyle(footer, "::before").height) || 0 : 0,
      room: Number.isFinite(head) ? Math.round(b.top - head) : null,
    }
  }, FOOTERS)
  test.info().annotations.push(
    { type: "top room", description: end.room === null ? "no header" : `${end.room}px from the header's ink to the body's top` },
    {
      type: "end room",
      description: `${end.gap === null ? "no footer" : `${end.gap}px to the footer's top (its fade ${end.fade}px)`} under ${end.row}`,
    },
  )
  if (end.room !== null) expect.soft(end.room, "px from the header's ink to the body's top edge").toBeGreaterThanOrEqual(6)
  expect(end.over, `what covers the foot of the body's last row, ${end.row}`).toEqual([])
  if (end.spill !== null) expect(end.spill, "px the footer's own content rises above the footer's top").toBeLessThanOrEqual(0)
  if (end.gap !== null) expect(end.gap, `px between the body's last row, ${end.row}, and the footer's top`).toBeGreaterThanOrEqual(end.fade)
}

/**
 * A phone sheet's foot (V-73): how far the footer's lowest control stands off
 * the sheet's bottom edge, and the footer's own side gutter (its left padding
 * from the sheet's left edge), in px, read in one frame once the sheet has
 * stopped moving.
 */
export async function sheetFoot(sheet: Locator): Promise<{ foot: number; gutter: number }> {
  await settled(sheet)
  return sheet.evaluate((el) => {
    const footer = el.querySelector("[data-sheet-footer], [data-overlay-footer], .v3-dlg-footer")
    if (!footer) throw new Error("the sheet has no footer")
    const box = el.getBoundingClientRect()
    const edge = footer.getBoundingClientRect().left + parseFloat(getComputedStyle(footer).paddingLeft)
    const controls = [...footer.querySelectorAll("button, a[href]")].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    if (!controls.length) throw new Error("the sheet's footer has no control")
    return { foot: box.bottom - Math.max(...controls.map((r) => r.bottom)), gutter: edge - box.left }
  })
}

/**
 * ONE foot for every phone sheet (V-73): its footer's controls stand as far
 * off the sheet's foot as its sides stand off its edges, and never less than
 * 16px (a footer with narrower sides still stands 16px off the foot). With a
 * home-indicator strip, the strip decides when it is more; a test has none.
 */
export async function footIsGutter(sheet: Locator, what: string): Promise<void> {
  const { foot, gutter } = await sheetFoot(sheet)
  const want = Math.max(16, gutter)
  expect(Math.abs(foot - want), `${what}: a foot of ${foot.toFixed(1)}px under a gutter of ${gutter.toFixed(1)}px, where ${want.toFixed(1)}px belongs`).toBeLessThanOrEqual(1)
  expect(foot, `${what}: a foot of ${foot.toFixed(1)}px, under the 16px floor`).toBeGreaterThanOrEqual(15.5)
}
