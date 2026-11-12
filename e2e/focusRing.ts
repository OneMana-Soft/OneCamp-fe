import { expect, type Locator, type Page } from "@playwright/test"

// A control's keyboard focus ring, as the browser draws it: the one copy every
// spec that checks a ring uses (calendar's trash, files and colours; tooltips;
// the notification panel).

/**
 * The focus ring `target` draws as the browser computes it: its outline, or the box-shadow layers it has focused
 * and not at rest (a copy of it beside it, unfocused), each with a colour that shows and a size.
 */
export const focusRing = (target: Locator) =>
  target.evaluate((el) => {
    const shows = (c: string) => c !== "" && c !== "transparent" && !/^rgba\((?:[^,]*,){3}\s*0(?:\.0+)?\)$/.test(c) && !/\/\s*0(?:\.0+)?\)$/.test(c)
    const drawn = (cs: CSSStyleDeclaration) => {
      const layers = cs.boxShadow === "none" ? [] : cs.boxShadow.split(/,(?![^(]*\))/).map((l) => l.trim())
      const shadows = layers.filter((l) => {
        const colour = l.match(/^(?:[a-z-]+\([^)]*\)|#[0-9a-f]+)/i)?.[0] ?? ""
        return shows(colour) && (l.slice(colour.length).match(/-?[\d.]+px/g) ?? []).some((n) => parseFloat(n) !== 0)
      })
      const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && shows(cs.outlineColor) ? `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}` : ""
      return { shadows, outline }
    }
    const copy = el.cloneNode(true) as Element
    copy.removeAttribute("id")
    el.after(copy)
    const rest = drawn(getComputedStyle(copy))
    copy.remove()
    const now = drawn(getComputedStyle(el))
    return { focusVisible: el.matches(":focus-visible"), outline: now.outline !== rest.outline ? now.outline : "", shadows: now.shadows.filter((s) => !rest.shadows.includes(s)) }
  })

/**
 * Tabs to `target` (the keyboard, so :focus-visible), from `from` when given, and asserts it draws a focus ring:
 * an outline or a box-shadow with a colour, which it has not at rest.
 */
export async function showsFocusRing(page: Page, target: Locator, what: string, from?: Locator) {
  if (from) await from.focus()
  for (let i = 0; i < 30 && !(await target.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
  await expect(target, `${what}, reached by Tab`).toBeFocused()
  await expect
    .poll(async () => {
      const ring = await focusRing(target)
      return ring.focusVisible && (ring.outline !== "" || ring.shadows.length > 0) ? "a ring" : JSON.stringify(ring)
    }, { message: `${what}'s focus ring` })
    .toBe("a ring")
}

/** Tabs onto `target` from the control before it, wherever the page put the focus. */
export async function tabOnto(page: Page, target: Locator) {
  await target.evaluate((el) => {
    const all = [...document.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter(
      (c) => !(c as HTMLButtonElement).disabled && c.tabIndex >= 0 && c.getClientRects().length > 0,
    )
    all[all.indexOf(el as HTMLElement) - 1]?.focus()
  })
  await page.keyboard.press("Tab")
  await expect(target).toBeFocused()
}
