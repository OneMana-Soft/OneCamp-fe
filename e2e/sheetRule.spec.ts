import { expect, test, type Locator } from "@playwright/test"

import { SAM, SHOT_THEMES, docInfo, reviewShot } from "./stubbedApp"
import { CollabRelay } from "./docs/collabRelay"
import { more, openDocWith, phoneOption } from "./docs/docWith"
import { footIsGutter, sheetLayout } from "./sheetLayout"
import { TableServer } from "./tables/tableServer"

// ONE SHEET RULE (20 Oct 2026; components/ui/overlayMode, guarded by
// app/overlayPhoneGuard). On a phone every overlay is a bottom sheet, held
// upright or sideways. Held sideways a phone is 844px wide, past isMobile's
// 640, and a doc's overlays chose by isMobile: its icon's picker came as a
// popover by the icon, version history as a dialog 342px tall, Save version
// as a popover with Save at the end of it, and Share as a centred dialog.
// Here, in a browser on a touch screen held both ways, each is the sheet
// (held sideways, at most 640px wide and in the middle), and Save version's
// Save is pinned in its footer.

const DOC = "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b"
const PHONES = [
  { way: "upright", width: 390, height: 844 },
  { way: "sideways", width: 844, height: 390 },
] as const
type Phone = (typeof PHONES)[number]

const V1 = { id: "v1", kind: "doc", pinned: true, name: "Sent to Acme", reason: "saved", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), contributors: [{ user_uuid: SAM.user_uuid }] }

/** The doc's own reads: the doc with an icon, its versions, and who it is shared with. */
function answers() {
  const info = docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p>We ship on Thursday.</p>", edit: true })
  Object.assign(info.data, { doc_icon: "📐" })
  return {
    [`/doc/getDocInfo/${DOC}`]: info,
    "/doc/versions/v1": { msg: "Success", data: { html: "<p>We ship on Friday.</p>" } },
    "/doc/versions": { msg: "Success", data: { versions: [V1], people: { [SAM.user_uuid]: { name: SAM.user_full_name } } } },
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
        sharing: { owner: SAM, people: [], teams: [], general: { private: true, level: "view" }, everyone: "none" },
      },
    },
  }
}

/**
 * `sheet` is open as the phone's sheet (components/ui/drawer), held sideways
 * at most 640px wide and in the middle, with nothing in it squashed: on 390px
 * of height the share sheet's General access was a 12px sliver.
 */
async function isSheet(sheet: Locator, phone: Phone, what: string) {
  await expect(sheet, `${what}: open`).toBeVisible({ timeout: 60_000 })
  await expect(sheet, `${what}: the phone's sheet, not a popover or a dialog`).toHaveAttribute("data-v3-sheet", "")
  const box = (await sheet.boundingBox())!
  expect(box.width, `${what}: as wide as the phone allows`).toBeLessThanOrEqual(Math.min(phone.width, 640) + 1)
  expect(Math.abs(box.x + box.width / 2 - phone.width / 2), `${what}: in the middle`).toBeLessThanOrEqual(1)
  const layout = await sheetLayout(sheet)
  expect(layout.squashed, `${what}: squashed below what it holds`).toEqual([])
  expect(layout.seeThrough, `${what}: what scrolls shows through a pinned part`).toEqual([])
}

for (const phone of PHONES) {
  test(`a phone held ${phone.way}: a doc's icon, version history, Save version and Share open as sheets`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000)
    const relay = new CollabRelay()
    const screen = { width: phone.width, height: phone.height, isMobile: true, hasTouch: true }
    const tab = await openDocWith(browser, testInfo, relay, SAM, { id: DOC, title: "Launch plan", body: "<p>We ship on Thursday.</p>" }, answers(), screen)
    const { page } = tab
    // Upright, the phone's doc bar and its sheet of options; sideways, the wide header.
    const upright = phone.width < 640
    const option = async (name: string) => {
      if (!upright) return name === "Share" ? page.locator("[data-doc-share]").click() : more(page, name)
      await phoneOption(page, name)
    }

    // The page's icon: its picker (the title band).
    await page.getByRole("button", { name: "Change the icon" }).click({ timeout: 60_000 })
    const icons = page.getByRole("dialog", { name: "Choose an icon" })
    await isSheet(icons, phone, "the icon's picker")
    await page.keyboard.press("Escape")
    await expect(icons).toBeHidden()

    // Version history, and Save version over it with its Save in the footer.
    await option("Version history")
    const history = page.locator("[data-history-sheet]")
    await isSheet(history, phone, "version history")
    await history.getByRole("button", { name: "Save version" }).click()
    const save = page.locator("[data-save-version-sheet]")
    await isSheet(save, phone, "Save version")
    await expect(save.locator("[data-sheet-footer]").getByRole("button", { name: "Save version" }), "Save version: Save pinned in the footer").toBeVisible()
    // Its foot is its gutter, never under 16px: the one rule for every phone sheet (V-73).
    await footIsGutter(save, "Save version")
    await page.keyboard.press("Escape")
    await expect(save).toBeHidden()
    await page.keyboard.press("Escape")
    await expect(history).toBeHidden()

    // Share: one of the page chrome's dialogs, its Done in the sheet's footer
    // on the one foot (V-73).
    await option("Share")
    const share = page.locator("[data-share-dialog]")
    await isSheet(share, phone, "Share")
    await footIsGutter(share, "the doc's Share sheet")
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/v73-share-doc-${phone.width}-light.png` })
    await tab.close()
  })
}

// A share dialog's own footer (components/dialog/shareParts' ShareFooter: a
// table's, a board's and a calendar's Share) is its sheet's foot on a phone,
// on the one rule for every phone sheet's footer (V-73, app/overlay.css 8b).
// It padded a foot of its own, 12px, over the dialog's 20px bottom padding:
// Done stood 32px off the foot of a sheet whose sides stand 20px in.
for (const theme of SHOT_THEMES) {
  test(`at 390 with touch, ${theme}: a table's Share sheet stands Done its gutter off the foot`, async ({ browser }, testInfo) => {
    const s = new TableServer([{ id: "item", name: "Item", type: "text" }], [{ item: "Booth" }])
    const { page, close } = await s.open(browser, testInfo, SAM, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    try {
      // The table's live links: none yet.
      await page.route(
        (url) => url.pathname.endsWith("/guest/links"),
        (route) => {
          const headers = { "access-control-allow-origin": route.request().headers()["origin"] || "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "*" }
          return route.request().method() === "OPTIONS" ? route.fulfill({ status: 204, headers }) : route.fulfill({ status: 200, headers, json: { data: [] } })
        },
      )
      await page.getByRole("button", { name: "Share", exact: true }).click()
      const share = page.locator("[data-share-dialog='table']")
      await expect(share.getByRole("button", { name: "Done" })).toBeVisible({ timeout: 60_000 })
      await expect(share, "the phone's sheet").toHaveAttribute("data-v3-sheet", "")
      await footIsGutter(share, "a table's Share sheet")
      await reviewShot(page, "v73-share-table", theme)
    } finally {
      await close()
    }
  })
}
