import { expect, test, type Page } from "@playwright/test"

import { lookPictures } from "../formLook"
import { SAM } from "../stubbedApp"
import { TableServer } from "./tableServer"

// Tables B5 (airtable-05's form view, notion-db-07): the table's managers
// open its forms from the layout tabs ("Form"), and a new form starts with a
// question for each column a form can fill; it's saved at the table's own
// address, each answer a row of the table. Someone who can't manage the
// table has no Form tab.

const SHOTS = process.env.SHOTS_DIR
// Column ids are uuids, as a form's maps_to takes them.
const COL = { item: "c0000000-0000-4000-8000-000000000001", contact: "c0000000-0000-4000-8000-000000000002", tier: "c0000000-0000-4000-8000-000000000003", budget: "c0000000-0000-4000-8000-000000000004" }
const served = () => {
  const server = new TableServer(
    [
      { id: COL.item, name: "Company", type: "text" },
      { id: COL.contact, name: "Contact", type: "email" },
      { id: COL.tier, name: "Tier", type: "select", config: { options: [{ id: "o1", label: "Gold", color: "sun" }, { id: "o2", label: "Silver", color: "sky" }] } },
      { id: COL.budget, name: "Budget", type: "number" },
    ],
    Array.from({ length: 5 }, (_, i) => ({ [COL.item]: `Vendor ${i}`, [COL.contact]: `v${i}@example.test`, [COL.tier]: i % 2 ? "Silver" : "Gold", [COL.budget]: i * 100 })),
  )
  server.name = "Vendors"
  return server
}

async function shoot(page: Page, name: string) {
  if (!SHOTS) return
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}-${scheme}.png` })
  }
  await page.emulateMedia({ colorScheme: "light" })
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  const phone = viewport.width < 600
  test(`at ${viewport.width}, a table's manager makes a form from its tabs, its questions the table's columns`, async ({ browser }, testInfo) => {
    test.setTimeout(180_000)
    const server = served()
    const sam = await server.open(browser, testInfo, SAM, { viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    const { page } = sam
    const pics = await lookPictures(page)
    await page.route("**/public/email/logo", (route) => route.fulfill({ status: 200, contentType: "image/png", body: pics.logo }))
    await expect(page.locator("tbody tr[data-row], [data-table-list] li[aria-setsize]").first()).toContainText("Vendor 0", { timeout: 30_000 })
    const tab = page.getByRole("button", { name: "Form", exact: true })
    await expect(tab).toBeVisible()
    await tab.click()
    const dialog = page.getByRole("dialog", { name: "Forms" })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByText("No forms yet")).toBeVisible()
    await expect(dialog).toContainText("lands in Vendors as a row")
    await dialog.getByRole("button", { name: /New form/ }).click()
    const editor = page.getByRole("dialog", { name: "New form" })
    await expect(editor.getByText("Each answer adds a row to Vendors")).toBeVisible()
    await expect(editor.getByRole("radio", { name: "A task" })).toHaveCount(0)
    // A question for each column, from the start.
    for (const name of ["Company", "Contact", "Tier", "Budget"]) await expect(editor.locator("[data-form-editor]")).toContainText(name)
    await editor.getByLabel("Title").fill("Vendor sign-up")
    if (!phone) await expect(editor.locator("[data-form-preview]")).toContainText("Vendor sign-up")
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-editor`)
    // B5c-2 (airtable-07's branding): a cover and a logo, each put up through the app's one upload as the new form's,
    // shown in the Look and in the preview, and saved with the form by their uploads' ids.
    const uploads: string[] = []
    // The first upload is held until its tile has been seen uploading.
    let release = () => {}
    const held = new Promise<void>((done) => (release = done))
    await page.route("**/uploadFile", async (route) => {
      const sent = route.request().postData() ?? ""
      uploads.push(sent.includes('{"src_key":"form","src_value":"new"}') ? "the new form's" : sent.slice(0, 120))
      const n = uploads.length
      if (n === 1) await held
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ msg: "ok", object_uuid: `a000000${n}-0000-4000-8000-00000000000${n}` }) })
    })
    const look = editor.locator("[data-form-look-edit]")
    await look.scrollIntoViewIfNeeded()
    // Empty: the cover's tile waits for one, and the logo's shows the workspace's, which the form wears until it has its own.
    await expect(look.getByRole("button", { name: "Add a cover" })).toBeVisible()
    await expect(look.locator('[data-look="logo"]')).toContainText("Your workspace's logo, until you add one.")
    await expect.poll(() => look.locator('[data-look="logo"] img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(240)
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-look-empty`)
    await look.locator('[data-look="cover"] input[type=file]').setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: pics.cover })
    // Uploading: the tile spins, and its buttons wait.
    await expect(look.locator('[data-look="cover"] .animate-spin')).toBeVisible()
    await expect(look.getByRole("button", { name: "Add a cover" })).toBeDisabled()
    if (!phone) {
      await page.mouse.move(0, 0)
      await shoot(page, `tableForms-${viewport.width}-look-uploading`)
    }
    release()
    await expect(look.getByRole("button", { name: "Replace cover" })).toBeVisible()
    await look.locator('[data-look="logo"] input[type=file]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: pics.logo })
    await expect(look.getByRole("button", { name: "Replace logo" })).toBeVisible()
    expect(uploads).toEqual(["the new form's", "the new form's"])
    // A file that isn't a picture every browser draws is refused at the row, and nothing goes up.
    await look.locator('[data-look="cover"] input[type=file]').setInputFiles({ name: "brief.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") })
    await expect(look.getByRole("alert")).toHaveText("Add a PNG, JPEG, WebP or GIF picture.")
    expect(uploads).toHaveLength(2)
    await expect(look.locator('[data-look="cover"] img')).toBeVisible()
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-look`)
    if (phone) await editor.getByRole("radio", { name: "Preview" }).click()
    await expect(editor.locator("[data-form-preview] [data-form-cover]")).toBeVisible()
    await expect(editor.locator("[data-form-preview] [data-form-logo]")).toBeVisible()
    await editor.locator("[data-form-preview]").scrollIntoViewIfNeeded()
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-look-preview`)
    if (phone) await editor.getByRole("radio", { name: "Questions" }).click()
    // B5c (main, 28 Oct): a link may fill Tier and hide it for a visit, once its manager turns that on; it starts off.
    await editor.getByRole("button", { name: "Question 3: Tier" }).click()
    const mayHide = editor.getByRole("switch", { name: "A link can fill and hide this" })
    await expect(mayHide).toHaveAttribute("aria-checked", "false")
    await expect(editor.locator("[data-hide-hint]")).toContainText("never for anything they must agree to")
    await expect(editor.locator("[data-hide-hint]")).not.toContainText("?hide_")
    await mayHide.click()
    await expect(editor.locator("[data-hide-hint]")).toContainText("?hide_")
    await editor.locator("[data-hide-hint]").scrollIntoViewIfNeeded()
    // Under a finger a switch reaches past its box (phone.css F3): two closer than 16 px would share taps, and
    // the later would take the earlier's (DB-27). Hidden's switch and this one stand as far apart as Required's
    // and Hidden's.
    const hiddenBox = (await editor.getByRole("switch", { name: "Hidden, filled by its link" }).boundingBox())!
    const hidesBox = (await mayHide.boundingBox())!
    const requiredBox = (await editor.getByRole("switch", { name: "Required", exact: true }).boundingBox())!
    expect(Math.round(hidesBox.y - (hiddenBox.y + hiddenBox.height)), "Hidden's switch to the link's").toBeGreaterThanOrEqual(16)
    expect(Math.round(hidesBox.y - hiddenBox.y), "the same pitch as Required's to Hidden's").toBe(Math.round(hiddenBox.y - requiredBox.y))
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-link-hides`)
    // B5b: Budget hidden, filled only by the link, and a page to go to once it's sent.
    await editor.getByRole("button", { name: "Question 4: Budget" }).click()
    if (!phone) await expect(editor.locator("[data-form-preview]")).toContainText("Budget")
    await editor.getByRole("switch", { name: "Hidden, filled by its link" }).click()
    await expect(editor.locator("[data-prefill-hint]")).toContainText("?prefill_")
    // The preview is the visitor's form: a hidden question isn't in it.
    if (!phone) await expect(editor.locator("[data-form-preview]")).not.toContainText("Budget")
    await expect(editor.getByRole("switch", { name: "Required", exact: true }).last()).toBeDisabled()
    await expect(editor.locator("[data-prefill-hint]")).toContainText("never required")
    // A page that isn't a full web address is refused before anything is sent, in the server's words.
    const page2 = editor.getByRole("textbox", { name: /Or go to a page/ })
    await page2.fill("example.test/thanks")
    await editor.getByRole("button", { name: "Create form" }).click()
    await expect(editor.getByText(/The page after sending needs a full web address/)).toBeVisible()
    expect(server.writes.filter((w) => w.kind === "form")).toEqual([])
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-redirect-error`)
    await page2.fill("https://example.test/thanks")
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-hidden`)
    await editor.getByRole("button", { name: "Create form" }).click()
    await expect.poll(() => server.writes.filter((w) => w.kind === "form").length, { timeout: 15_000 }).toBe(1)
    const made = server.writes.find((w) => w.kind === "form")!.body as { target_table: string; redirect: string; cover_id?: string; logo_id?: string; fields: { label: string; maps_to: string; hidden?: boolean; link_hides?: boolean }[] }
    expect([made.cover_id, made.logo_id], "the pictures, by their uploads' ids").toEqual(["a0000001-0000-4000-8000-000000000001", "a0000002-0000-4000-8000-000000000002"])
    expect(made.fields.filter((f) => f.link_hides).map((f) => f.label)).toEqual(["Tier"])
    expect(made.target_table).toBe(server.id)
    expect(made.redirect).toBe("https://example.test/thanks")
    expect(made.fields.filter((f) => f.hidden).map((f) => f.label)).toEqual(["Budget"])
    expect(made.fields.map((f) => [f.label, f.maps_to])).toEqual([
      ["Company", `column:${COL.item}`],
      ["Contact", `column:${COL.contact}`],
      ["Tier", `column:${COL.tier}`],
      ["Budget", `column:${COL.budget}`],
    ])
    const list = page.getByRole("dialog", { name: "Forms" })
    await expect(list.locator("[data-form-row]")).toHaveCount(1, { timeout: 15_000 })
    await expect(list.locator("[data-form-row]")).toContainText("Vendor sign-up")
    await expect(list.locator("[data-form-row]")).not.toContainText("Adds rows to")
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-list`)
    await sam.close()
  })

  test(`at ${viewport.width}, a workspace with no logo: the Look's logo tile is empty and says none yet`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const server = served()
    const sam = await server.open(browser, testInfo, SAM, { viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
    const { page } = sam
    // A workspace that never added a logo: the server has none to give.
    await page.route("**/public/email/logo", (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ msg: "No logo yet" }) }))
    await expect(page.locator("tbody tr[data-row], [data-table-list] li[aria-setsize]").first()).toContainText("Vendor 0", { timeout: 30_000 })
    await page.getByRole("button", { name: "Form", exact: true }).click()
    await page.getByRole("dialog", { name: "Forms" }).getByRole("button", { name: /New form/ }).click()
    const editor = page.getByRole("dialog", { name: "New form" })
    const look = editor.locator("[data-form-look-edit]")
    await look.scrollIntoViewIfNeeded()
    await expect(look.locator('[data-look="logo"]')).toContainText("None yet: one you add shows over the title.")
    await expect(look.locator('[data-look="logo"] img')).toHaveCount(0)
    await expect(look.getByRole("button", { name: "Add a logo" })).toBeEnabled()
    if (!phone) await expect(editor.locator("[data-form-preview] [data-form-logo]")).toHaveCount(0)
    await page.mouse.move(0, 0)
    await shoot(page, `tableForms-${viewport.width}-look-nologo`)
    await sam.close()
  })
}

test("someone who can't manage the table has no Form tab", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const server = served()
  server.canManage = false
  const sam = await server.open(browser, testInfo, SAM)
  const { page } = sam
  await expect(page.locator("tbody tr[data-row]").first()).toContainText("Vendor 0", { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Gallery", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Form", exact: true })).toHaveCount(0)
  expect(server.writes.filter((w) => w.kind === "form")).toEqual([])
  await sam.close()
})
