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
  const met = await row.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (at && (at === el || el.contains(at))) return "the row"
    return at ? `<${at.tagName.toLowerCase()} class="${String(at.getAttribute("class") ?? "").slice(0, 80)}">` : "nothing"
  })
  expect(met, "what the pointer meets at the row's centre").toBe("the row")
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
    for (let i = 0; i < 12; i++) {
      if (await row.evaluate((el) => el === document.activeElement)) break
      await page.keyboard.press("ArrowDown")
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
