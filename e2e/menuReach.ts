import { expect, type Locator, type Page } from "@playwright/test"

/**
 * Whether a person can see and press a row of a floating menu, as a browser
 * draws it:
 *   - all of it in view, by an IntersectionObserver (toBeInViewport), which
 *     follows the browser's own clipping: a side menu cut away by the menu it
 *     sits in measures 0;
 *   - the row itself under the pointer at its centre (elementFromPoint):
 *     nothing covers it, and it takes the press.
 * The board card's "Move to…" (18 Oct 2026) passed a role query and
 * toBeVisible while nothing beside the menu could be seen; both of these
 * failed it, in Chromium, Firefox and WebKit.
 */
export async function expectReachable(row: Locator) {
  await expect(row).toBeVisible()
  await expect(row).toBeInViewport({ ratio: 0.98 })
  expect(await metAtCentre(row), "what the pointer meets at the row's centre").toBe("the row")
}

/**
 * Rests the pointer on a row of a virtual list once the row is what the
 * pointer meets at its centre. The list (virtua) turns its rows' pointer
 * events off while it scrolls, and a conversation re-pins to its end for a
 * moment after it opens. A hover inside that window met the list instead;
 * Playwright's retry scrolled the row into view, the list re-pinned, and the
 * row moved from under the pointer, taking its hover toolbar with it (the More
 * menu's flake, 27 Oct 2026).
 */
export async function hoverWhenReachable(row: Locator) {
  await expect.poll(() => metAtCentre(row), { message: "what the pointer meets at the row's centre" }).toBe("the row")
  await row.hover()
}

/** What the pointer meets at an element's centre: "the row" when it's the element or inside it. */
function metAtCentre(row: Locator) {
  return row.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (at && (at === el || el.contains(at))) return "the row"
    return at ? `<${at.tagName.toLowerCase()} class="${String(at.getAttribute("class") ?? "").slice(0, 80)}">` : "nothing"
  })
}

/**
 * The shared radio item marks the chosen row with the app's one check
 * (MenuCheck, meet-18), in its 16px slot, and no other row: a production
 * build's computed style, not jsdom's.
 */
export async function radioChecks(menu: Locator) {
  const chosen = menu.getByRole("menuitemradio", { checked: true })
  await expect(chosen).toHaveCount(1)
  const check = chosen.locator('[data-menu-check="on"]')
  await expect(check).toBeVisible()
  const box = await check.boundingBox()
  expect(box && Math.round(box.width)).toBe(16)
  await expect(menu.locator('[role="menuitemradio"][aria-checked="false"] [data-menu-check]')).toHaveCount(0)
}

/**
 * Opens the side menu a row leads to, by pointer (resting on the row) or by
 * keyboard (arrowing down the menu to the row, then ArrowRight), and returns
 * it once every row in it is reachable. The side menu is the one the row
 * names (aria-controls), and it is no other menu's descendant.
 */
export async function openSideMenu(page: Page, menu: Locator, rowName: string | RegExp, by: "pointer" | "keyboard"): Promise<Locator> {
  const row = menu.getByRole("menuitem", { name: rowName })
  if (by === "pointer") {
    await row.hover()
  } else {
    // A person sees where ↓ took the focus before pressing again, and so does this.
    // Radix moves the focus a task after the key (RovingFocusGroup's setTimeout): a
    // look straight after a press could still see the row before, and the next press,
    // landing after the move, went past the row. In the share dialog (22 Oct 2026) a
    // look saw Access ends while a press already sent took the focus on to Remove access.
    for (let i = 0; i < 12; i++) {
      if (await row.evaluate((el) => el === document.activeElement)) break
      const from = await page.evaluateHandle(() => document.activeElement)
      await page.keyboard.press("ArrowDown")
      await page.waitForFunction((was) => document.activeElement !== was, from, { timeout: 2_000 }).catch(() => {})
      await from.dispose()
    }
    await expect(row).toBeFocused()
    await page.keyboard.press("ArrowRight")
  }
  await expect(row).toHaveAttribute("aria-expanded", "true")
  const id = await row.getAttribute("aria-controls")
  expect(id, "the row names its side menu").toBeTruthy()
  const side = page.locator(`[id="${id}"]`)
  await expect(side).toBeVisible()
  for (const item of await side.locator('[role^="menuitem"]').all()) await expectReachable(item)
  expect(await side.evaluate((el) => Boolean(el.parentElement?.closest('[role="menu"]'))), "the side menu is drawn inside another menu").toBe(false)
  if (by === "keyboard") await expect(side.locator('[role^="menuitem"]').first()).toBeFocused()
  return side
}

/**
 * What an open overlay's root holds once it has settled, that would make it
 * the containing block of a fixed box inside it (and so clip that box to its
 * own): a transform, filter, backdrop filter, perspective, containment,
 * will-change of one of those, or an animation that moves and still holds its
 * last frame. Measured in Chromium, Firefox and WebKit (18 Oct 2026): each of
 * these traps a fixed child; an entrance that fills backwards does not.
 */
export async function trapsAtRest(root: Locator): Promise<string[]> {
  // At rest: what it still holds 2 s on. WebKit reports no running animation
  // while a slide is still mid-way, so this measures until nothing is held.
  let held: string[] = []
  for (let i = 0; i < 10; i++) {
    await root.page().waitForTimeout(200)
    held = await measure(root)
    if (held.length === 0) break
  }
  return held
}

function measure(root: Locator): Promise<string[]> {
  return root.evaluate((node) => {
    const cs = getComputedStyle(node) as CSSStyleDeclaration & Record<string, string>
    const out: string[] = []
    const set = (name: string, value: string | undefined, none = "none") => {
      if (value && value !== none) out.push(`${name}: ${value}`)
    }
    set("transform", cs.transform)
    set("translate", cs.translate)
    set("scale", cs.scale)
    set("rotate", cs.rotate)
    set("filter", cs.filter)
    set("backdrop-filter", cs.backdropFilter ?? cs.webkitBackdropFilter)
    set("perspective", cs.perspective)
    if (/layout|paint|strict|content/.test(cs.contain)) out.push(`contain: ${cs.contain}`)
    if (/transform|filter|perspective|translate|scale|rotate|contain/.test(cs.willChange)) out.push(`will-change: ${cs.willChange}`)
    for (const a of node.getAnimations()) {
      const effect = a.effect as KeyframeEffect | null
      const moves = (effect?.getKeyframes() ?? []).some((f) => "transform" in f || "translate" in f || "scale" in f || "rotate" in f)
      const fill = effect?.getComputedTiming().fill
      if (moves && a.playState === "finished" && (fill === "forwards" || fill === "both")) out.push(`a held animation (${(a as CSSAnimation).animationName}, fill ${fill})`)
    }
    return out
  })
}

/** What a person can press, for the reach scan. */
const CONTROLS =
  'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="checkbox"], [role="switch"], [role="tab"], [role="radio"], [role="menuitem"], [role="option"]'

/** A control the scan marked (data-reach-scan), and where its centre is. */
interface Marked {
  i: number
  name: string
  x: number
  y: number
  /** Not shown or not taking the pointer at rest: a hover may show it (a card's toolbar). */
  hidden: boolean
}

/**
 * The controls on the page that something else covers at their centre, each
 * as `"name" under <what>`: every control drawn in the viewport and, with a
 * pointer, every one a hover shows. ITEM 0 (23 Oct 2026): a file card's ⋯
 * and Download sat under the card's stretched click area, so a click opened
 * the lightbox and Delete could not be reached on a computer, while role
 * queries and toBeVisible passed. Left out: a control whose centre a box it
 * sits in clips away (an overflow: scrolled into view, it is what the pointer
 * meets), and one an overlay (a dialog, a menu, a popover, a toast) is open
 * over.
 */
export async function coveredControls(page: Page, { hover }: { hover: boolean }): Promise<string[]> {
  const covered: string[] = []
  for (const control of await page.evaluate(markControls, CONTROLS)) {
    if (control.hidden) {
      if (!hover) continue
      await page.mouse.move(control.x, control.y)
      const shown = await page.waitForFunction(takesPointer, control.i, { timeout: 750 }).then(
        () => true,
        () => false,
      )
      if (!shown) continue
    }
    const under = await page.evaluate(whatCovers, control)
    if (under) covered.push(`${control.hidden ? "(on hover) " : ""}"${control.name}" under ${under}`)
  }
  return covered
}

// The three below run in the page, each on its own: none may reach outside itself.

function markControls(selector: string): Marked[] {
  // A scan before this one marked controls that may still be on the page.
  for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-reach-scan]"))) delete el.dataset.reachScan
  const marked: Marked[] = []
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    if ((el as HTMLButtonElement).disabled || el.closest('[aria-hidden="true"], [inert]')) continue
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    if (r.width < 6 || r.height < 6 || x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue
    const own = getComputedStyle(el)
    if (own.visibility !== "visible") continue
    let clipped = false
    let transparent = false
    for (let a: HTMLElement | null = el; a; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.opacity === "0") transparent = true
      if (a !== el && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) {
        const box = a.getBoundingClientRect()
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) clipped = true
      }
    }
    if (clipped) continue
    const i = marked.length
    el.dataset.reachScan = String(i)
    const name = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 40)
    marked.push({ i, name, x, y, hidden: transparent || own.pointerEvents === "none" })
  }
  return marked
}

function takesPointer(i: number): boolean {
  const el = document.querySelector(`[data-reach-scan="${i}"]`)
  if (!el) return true
  for (let a: Element | null = el; a; a = a.parentElement) if (getComputedStyle(a).opacity === "0") return false
  return getComputedStyle(el).pointerEvents !== "none"
}

function whatCovers({ i, x, y }: Marked): string | null {
  const el = document.querySelector(`[data-reach-scan="${i}"]`)
  const hit = document.elementFromPoint(x, y)
  if (!el || !hit || el === hit || el.contains(hit)) return null
  // A label takes its control's press.
  const label = hit.closest("label")
  if (label && (label.contains(el) || label.control === el)) return null
  const overlay = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-sonner-toaster]'
  if (hit.closest(overlay) && !el.closest(overlay)) return null
  const owner = hit.closest<HTMLElement>('button, a, input, select, textarea, [role], [contenteditable="true"]') ?? (hit as HTMLElement)
  const name = (owner.getAttribute("aria-label") || owner.getAttribute("title") || owner.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40)
  return `<${owner.tagName.toLowerCase()}${name ? ` "${name}"` : ""}>`
}
