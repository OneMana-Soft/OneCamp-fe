import { expect, test, type BrowserContextOptions, type Locator, type Page } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// An input group (components/ui/input-group) is the field round its text, and
// draws the field's states (app/globals.css .field-surface) on the group
// itself, keyed on what the group carries rather than a :has()
// (app/selectorKeyGuard.test.ts): the halo while its text holds focus
// (:focus-within), the danger halo while its text is invalid (data-invalid),
// focused or not, the disabled look (data-disabled), and a hover ring only at
// rest. Each look is read beside a plain field's in the same state on the same
// page, so the group draws exactly what every field draws. InputGroup sets
// data-invalid and data-disabled from its text (components/ui/inputGroup.test.tsx).

const PHONE: BrowserContextOptions = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
const COMPUTER: BrowserContextOptions = { viewport: { width: 1280, height: 800 } }

type Look = { shadow: string; ground: string }

/** A plain field's look in each state: a field-surface input made for the reading, then taken away. */
async function plainLooks(page: Page): Promise<Record<"rest" | "focus" | "invalid" | "disabled", Look>> {
  return page.evaluate(() => {
    const field = document.createElement("input")
    field.className = "field-surface"
    document.body.append(field)
    const look = () => ({ shadow: getComputedStyle(field).boxShadow, ground: getComputedStyle(field).backgroundColor })
    const rest = look()
    field.focus()
    const focus = look()
    field.blur()
    field.setAttribute("aria-invalid", "true")
    const invalid = look()
    field.removeAttribute("aria-invalid")
    field.disabled = true
    const disabled = look()
    field.remove()
    return { rest, focus, invalid, disabled }
  })
}

const lookOf = (group: Locator) =>
  group.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, ground: getComputedStyle(el).backgroundColor }))

const mark = (group: Locator, name: "data-invalid" | "data-disabled", on: boolean) =>
  group.evaluate((el, [n, o]) => (o ? el.setAttribute(n as string, "") : el.removeAttribute(n as string)), [name, on] as const)

for (const [name, options] of [
  ["a 390px phone, by touch", PHONE],
  ["a 1280px computer", COMPUTER],
] as const) {
  test(`an input group draws a field's states from what it carries, on ${name}`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const context = await browser.newContext(options)
    const page = await context.newPage()
    await stubBackend(page, testInfo, {
      "/dm/getLatestChatList": { msg: "ok", data: { ...SAM, user_dms: [] } },
    })
    await page.goto("/app/chat", { waitUntil: "domcontentloaded", timeout: 180_000 })
    // The shared SearchInput's own text, once its chunk has replaced the stand-in (components/ui/lazy-search-input).
    const text = page.locator('[data-slot="input-group-control"][aria-label="Find a conversation"]').first()
    await expect(text).toBeVisible({ timeout: 120_000 })
    // The end of each state, not a frame of its 140ms change.
    await page.addStyleTag({ content: "*, *::before, *::after { transition: none !important; }" })
    const group = text.locator("xpath=ancestor::*[@data-slot='input-group'][1]")
    const plain = await plainLooks(page)
    expect(plain.focus.shadow, "a plain field's halo").not.toBe(plain.rest.shadow)
    expect(plain.invalid.shadow, "a plain field's danger halo").not.toBe(plain.focus.shadow)

    expect(await lookOf(group), "at rest").toEqual(plain.rest)
    const hovers = !options.hasTouch
    if (hovers) {
      await group.hover()
      expect((await lookOf(group)).shadow, "hovered at rest: the hover ring").not.toBe(plain.rest.shadow)
    }

    if (options.hasTouch) await text.tap()
    else await text.click()
    await expect(text).toBeFocused()
    expect((await lookOf(group)).shadow, "its text focused: the field's halo").toBe(plain.focus.shadow)
    if (hovers) {
      await group.hover()
      expect((await lookOf(group)).shadow, "hovered while focused: the halo, no hover ring").toBe(plain.focus.shadow)
    }

    await mark(group, "data-invalid", true)
    expect((await lookOf(group)).shadow, "invalid while focused: danger wins").toBe(plain.invalid.shadow)
    await text.blur()
    await page.mouse.move(0, 0)
    expect((await lookOf(group)).shadow, "invalid at rest").toBe(plain.invalid.shadow)
    await mark(group, "data-invalid", false)

    await mark(group, "data-disabled", true)
    expect(await lookOf(group), "disabled").toEqual(plain.disabled)
    if (hovers) {
      await group.hover()
      expect(await lookOf(group), "hovered while disabled: no hover ring").toEqual(plain.disabled)
    }
    await context.close()
  })
}
