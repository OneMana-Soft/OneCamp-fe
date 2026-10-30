import { expect, test } from "@playwright/test"

import { SAM } from "./stubbedApp"
import { TableServer } from "./tables/tableServer"

// DB-30's should-fix (29 Oct): the browser's up and down arrows showed on
// twelve number fields, which took globals.css's no-spinner one field at a
// time. Every number field hides them now, from globals.css's base layer, so
// the rule is in the CSS the app ships: a number field put on a page, at 1280
// and at 390 with touch, draws as a text field, with no spin buttons.
for (const device of [
  { name: "at 1280", options: {} },
  { name: "at 390 with touch", options: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
]) {
  test(`${device.name}, a number field anywhere hides the browser's stepper`, async ({ browser }, testInfo) => {
    const server = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Booth" }])
    const { page, close } = await server.open(browser, testInfo, SAM, device.options)
    const drawn = await page.evaluate(() => {
      const input = document.createElement("input")
      input.type = "number"
      document.body.append(input)
      const field = getComputedStyle(input).appearance
      input.remove()
      // The spin buttons are pseudo-elements a page can't read the style of: the shipped rules that take them off.
      const spins: string[] = []
      const walk = (rules: CSSRuleList, parent: string) => {
        for (const rule of Array.from(rules)) {
          const style = rule as CSSStyleRule
          const selector = style.selectorText ? style.selectorText.replace(/&/g, parent) : parent
          if (style.selectorText && /spin-button/.test(selector) && /input\[type="?number"?\]/.test(selector) && style.style.appearance === "none") spins.push(selector)
          if ((rule as CSSGroupingRule).cssRules) walk((rule as CSSGroupingRule).cssRules, selector)
        }
      }
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules, "")
        } catch {
          // another origin's sheet
        }
      }
      return { field, inner: spins.some((s) => s.includes("inner-spin-button")), outer: spins.some((s) => s.includes("outer-spin-button")) }
    })
    expect(drawn).toEqual({ field: "textfield", inner: true, outer: true })
    await close()
  })
}
