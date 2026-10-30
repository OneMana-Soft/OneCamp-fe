import { expect, test, type Locator, type Page } from "@playwright/test"

import { SAM, docInfo } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { openDocWith } from "./docs/docWith"
import { settled } from "./sheetLayout"

// INTERACTION POLISH (DESIGN-BUILD-5, 22 Oct 2026), on a production build:
//   - an open sheet owns the bottom of a phone's screen, as the keyboard does,
//     so toasts come in under the top bar while one is up (app/phone.css C9,
//     html[data-sheet] from components/ui/drawer);
//   - on a short phone a menu sheet keeps the group that holds what destroys
//     at its foot, in reach, while the rest scrolls (components/ui/sheet-menu);
//   - a sheet's and a dialog's description wraps pretty;
//   - an open trigger is engaged in ink, not the accent, and a menu's own
//     items keep the brand (app/interaction.css).

const DOC = "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b"

function answers() {
  return {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p>We ship on Thursday.</p>", edit: true }),
    [`/doc/access/${DOC}`]: {
      data: {
        doc_uuid: DOC,
        level: "full",
        owner: true,
        lock: "",
        locked: false,
        can_share: true,
        can_lock_soft: true,
        can_lock_hard: true,
        sharing: { owner: SAM, people: [], teams: [], general: { private: false, level: "view" }, everyone: "none" },
      },
    },
  }
}

const phone = (width: number, height: number) => ({ width, height, isMobile: true, hasTouch: true })

/** The doc's sheet of options, open on a phone. */
async function openOptions(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Document options" }).click({ timeout: 60_000 })
  const sheet = page.locator('[data-v3-sheet][data-detent="menu"]')
  await expect(sheet).toBeVisible({ timeout: 30_000 })
  await settled(sheet)
  return sheet
}

/**
 * Where the toasts' list sits: under the top bar (its top, in px) or at the
 * foot. Read from its box: a fixed box's computed `bottom` is a length even
 * where the rule says auto.
 */
const toastsAt = (page: Page) =>
  page.locator(".toast-viewport").evaluate((vp) => {
    const { top } = vp.getBoundingClientRect()
    return top < innerHeight / 2 ? `top ${Math.round(top)}` : "foot"
  })

/** `row` can be pressed where it is: on screen, and the top thing at its middle. */
async function inReach(page: Page, row: Locator, what: string) {
  const box = (await row.boundingBox())!
  const view = page.viewportSize()!
  expect(box.y, `${what}: below the top`).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, `${what}: above the foot of the screen`).toBeLessThanOrEqual(view.height)
  const hit = await row.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!top && (top === el || el.contains(top))
  })
  expect(hit, `${what}: nothing over it`).toBe(true)
}

test.describe("a phone with a sheet open", () => {
  test("toasts come in under the top bar while a sheet is up, and go back to the foot after", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch plan" }, answers(), phone(390, 844))
    const { page } = tab
    await page.getByRole("button", { name: "Document options" }).waitFor({ timeout: 60_000 })
    expect(await toastsAt(page), "no sheet: the foot").toBe("foot")
    const sheet = await openOptions(page)
    await expect(page.locator("html")).toHaveAttribute("data-sheet", "open")
    const at = await toastsAt(page)
    expect(at, "a sheet up: under the top bar").toMatch(/^top \d+$/)
    expect(Number(at.split(" ")[1]), "under the top bar, not over the sheet's foot").toBeLessThan(120)
    // Its description wraps pretty (components/ui/drawer).
    const described = await sheet.getAttribute("aria-describedby")
    if (described) {
      const wrap = await page.locator(`[id="${described}"]`).evaluate((el) => getComputedStyle(el).getPropertyValue("text-wrap-style") || getComputedStyle(el).getPropertyValue("text-wrap"))
      expect(wrap).toContain("pretty")
    }
    await page.keyboard.press("Escape")
    await expect(sheet).toBeHidden()
    await expect(page.locator("html")).not.toHaveAttribute("data-sheet", "open")
    expect(await toastsAt(page), "the sheet gone: the foot again").toBe("foot")
    await tab.close()
  })

  for (const [w, h] of [
    [375, 667],
    [375, 520],
  ] as const) {
    test(`at ${w}x${h}, what destroys stays in reach while the rest scrolls`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch plan" }, answers(), phone(w, h))
      const { page } = tab
      const sheet = await openOptions(page)
      const danger = sheet.locator("[data-sheet-group][data-holds-danger]")
      // Delete is the page's own action: it joins a sheet opened before the
      // page offered it (components/drawers/docOptionsDrawer).
      await expect(danger, "the group that holds what destroys is marked").toHaveCount(1, { timeout: 30_000 })
      await settled(sheet)
      const row = danger.locator('[data-tone="danger"]').first()
      await inReach(page, row, "the destructive row, untouched")
      const body = sheet.locator("[data-sheet-body]")
      const scrolls = await body.evaluate((el) => el.scrollHeight > el.clientHeight + 1)
      if (h < 600) expect(scrolls, `at ${h}px the menu is taller than its 60dvh`).toBe(true)
      if (scrolls) {
        // Halfway down, and at the end: still in reach, and the rows go under it.
        await body.evaluate((el) => (el.scrollTop = (el.scrollHeight - el.clientHeight) / 2))
        await inReach(page, row, "the destructive row, halfway down")
        await body.evaluate((el) => (el.scrollTop = el.scrollHeight))
        await inReach(page, row, "the destructive row, at the end")
        await inReach(page, sheet.getByRole("button", { name: "Cancel" }), "Cancel, at the end")
      }
      await tab.close()
    })
  }
})

test.describe("a phone with a field at the foot", () => {
  // calls-7's room form at 390: no keyboard reported, and the Undo sat over
  // the Address field being typed in. A field the foot slot meets sends the
  // toasts under the top bar; one above it, or a button, leaves them.
  test("toasts come in under the top bar while the field in use is where they'd show, by touch", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch plan" }, answers(), phone(390, 844))
    const { page } = tab
    await page.getByRole("button", { name: "Document options" }).waitFor({ timeout: 60_000 })
    expect(await toastsAt(page), "nothing in use: the foot").toBe("foot")
    // A form's last field, just where the toasts show.
    const foot = await page.locator(".toast-viewport").evaluate((vp) => vp.getBoundingClientRect().bottom)
    await page.evaluate((bottom) => {
      const at = (name: string, top: number) => {
        const field = document.body.appendChild(document.createElement("input"))
        field.setAttribute("aria-label", name)
        Object.assign(field.style, { position: "fixed", left: "16px", width: "200px", height: "40px", top: `${top}px`, zIndex: "9999" })
      }
      at("Address", bottom - 40)
      at("Name", 200)
    }, foot)
    await page.getByRole("textbox", { name: "Address" }).tap()
    await expect.poll(() => toastsAt(page), { message: "the field at the foot in use: under the top bar" }).toMatch(/^top \d+$/)
    await page.getByRole("textbox", { name: "Name" }).tap()
    await expect.poll(() => toastsAt(page), { message: "a field above the slot: the foot" }).toBe("foot")
    await page.getByRole("textbox", { name: "Address" }).tap()
    await expect.poll(() => toastsAt(page)).toMatch(/^top \d+$/)
    await page.getByRole("textbox", { name: "Address" }).blur()
    await expect.poll(() => toastsAt(page), { message: "nothing in use: the foot again" }).toBe("foot")
    await tab.close()
  })
})

test.describe("a computer", () => {
  test("an open trigger is engaged in ink, and its menu's items keep the brand", async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch plan" }, answers(), { width: 1280, height: 900 })
    const { page } = tab
    // Every kind the rule names, as the layer draws it (the production CSS).
    const tints = await page.evaluate(() => {
      const make = (attrs: Record<string, string>) => {
        const b = document.createElement("button")
        for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v)
        document.body.append(b)
        const s = getComputedStyle(b)
        const out = { tint: s.getPropertyValue("--ix-tint").trim(), mark: s.getPropertyValue("--ix-mark").trim(), ink: s.getPropertyValue("--ink").trim(), brand: s.getPropertyValue("--brand").trim() }
        b.remove()
        return out
      }
      return {
        open: ["button", "icon", "chip", "row", "nav"].map((kind) => make({ "data-interactive": kind, "data-state": "open" })),
        popup: make({ "data-interactive": "button", "aria-expanded": "true", "aria-haspopup": "menu" }),
        closed: make({ "data-interactive": "button", "data-state": "closed" }),
        item: make({ "data-interactive": "item", "data-state": "open" }),
        fold: make({ "data-interactive": "nav", "aria-expanded": "true" }),
        toned: make({ "data-interactive": "icon", "data-state": "open", "data-tone": "danger" }),
      }
    })
    for (const t of [...tints.open, tints.popup]) {
      expect(t.tint).toBe(t.ink)
      expect(t.mark).toBe(t.ink)
    }
    for (const t of [tints.closed, tints.item, tints.fold]) expect(t.tint).toBe(t.brand)
    expect(tints.toned.tint).not.toBe(tints.toned.ink)

    // A real one: Share's level for everyone in the workspace, open. It is
    // the people's LevelMenu (shareParts), named "<audience>: <level>". Its
    // open menu hides the dialog from the accessibility tree, so the query
    // takes hidden elements too, or it loses the trigger once it opens.
    await page.locator("[data-doc-share]").click({ timeout: 60_000 })
    const level = page.locator("[data-share-dialog]").getByRole("button", { name: /^Everyone in the workspace: /, includeHidden: true })
    await level.click()
    await expect(level).toHaveAttribute("data-state", "open")
    const real = await level.evaluate((el) => {
      const s = getComputedStyle(el)
      return { tint: s.getPropertyValue("--ix-tint").trim(), ink: s.getPropertyValue("--ink").trim() }
    })
    expect(real.tint, "the open level picker: ink").toBe(real.ink)
    const item = page.getByRole("menuitem").first()
    await expect(item).toBeVisible()
    const itemTint = await item.evaluate((el) => {
      const s = getComputedStyle(el)
      return { tint: s.getPropertyValue("--ix-tint").trim(), brand: s.getPropertyValue("--brand").trim(), interactive: el.getAttribute("data-interactive") }
    })
    if (itemTint.interactive === "item") expect(itemTint.tint, "its menu's item: the brand").toBe(itemTint.brand)
    // The dialog's own description wraps pretty (components/ui/dialog).
    await page.keyboard.press("Escape")
    const dialog = page.locator("[data-share-dialog]")
    const described = await dialog.getAttribute("aria-describedby").catch(() => null)
    if (described) {
      const wrap = await page.locator(`[id="${described}"]`).evaluate((el) => getComputedStyle(el).getPropertyValue("text-wrap-style") || getComputedStyle(el).getPropertyValue("text-wrap"))
      expect(wrap).toContain("pretty")
    }
    await tab.close()
  })
})
