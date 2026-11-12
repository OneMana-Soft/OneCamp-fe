import { expect, test, type Page } from "@playwright/test"

import { linkVendorDoc, linking, VENDOR_DOC } from "./entityLinking"
import { expectReachable } from "./menuReach"
import { openFiles, P, PNG, READER } from "./projectFiles"
import { reviewShot } from "./stubbedApp"

// A project's Files tab, in a real browser with no backend: a file goes up
// through Upload and joins the project, and a file is deleted through its ⋯,
// the confirm and the request, as cards and as rows at 1280 and as rows on a
// phone at 390.
//
// Why (23 Oct 2026, the owner on the demo): Delete could not be reached on a
// computer. Each card's name button stretches its click area over the preview
// for the lightbox, and it was drawn over the toolbar on the preview, so a
// click on ⋯ or Download opened the lightbox and the menu that holds Delete
// never opened (web 8a1c0b024, 11 Oct). The tab's unit test mocked every hook
// and never drew a card under a pointer.

/** Uploads one picture through the tab's Upload, and waits for it to join the project and show. */
async function upload(page: Page, writes: { path: string; body: unknown }[]) {
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: /^Upload$/ }).first().click()])
  const added = page.waitForRequest((r) => r.url().endsWith("/project/addAttachment"))
  await chooser.setFiles({ name: "Hero shot.png", mimeType: "image/png", buffer: PNG })
  await added
  await expect(page.getByText("Hero shot.png").first()).toBeVisible()
  const add = writes.find((w) => w.path === "/project/addAttachment")?.body as { project_uuid: string; project_attachments: Array<{ attachment_file_name: string; attachment_uuid: string }> }
  expect(add.project_uuid).toBe(P)
  expect(add.project_attachments.map((a) => a.attachment_file_name)).toEqual(["Hero shot.png"])
}

/** Deletes the file the open menu is for: Delete, the confirm, the request with its id; then the file is gone. */
async function deleteFromOpenMenu(page: Page, name: string, id: string) {
  await page.getByRole("menuitem", { name: "Delete" }).click()
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toContainText(name)
  const sent = page.waitForRequest((r) => r.url().endsWith("/project/removeAttachment"))
  await confirm.getByRole("button", { name: "Delete file" }).click()
  expect((await sent).postDataJSON()).toEqual({ attachment_obj_key: id })
  await expect(page.getByText(name)).toHaveCount(0)
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("Link a doc or board finds a doc through the workspace search and links it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { sent, answers } = linking()
    await openFiles(page, testInfo, answers)
    await linkVendorDoc(page, page.getByRole("button", { name: "Link a doc or board" }), false)
    await expect.poll(() => sent).toEqual([{ source_type: "project", source_uuid: P, ref_type: "doc", ref_uuid: VENDOR_DOC.doc_uuid }])
    await expect(page.getByText(VENDOR_DOC.doc_title)).toBeVisible()
  })

  test("a file goes up through Upload, and a card's ⋯ and Download take the pointer and Delete removes it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { writes } = await openFiles(page, testInfo)
    await upload(page, writes)

    const card = page.locator("[data-file-card]").filter({ hasText: "Launch brief.pdf" })
    await card.hover()
    const options = card.getByRole("button", { name: "Attachment options" })
    await expectReachable(options)
    await expectReachable(card.getByRole("button", { name: "Download Launch brief.pdf" }))
    await options.click()
    await expect(page.getByRole("dialog", { name: "Launch brief.pdf" }), "a click on ⋯ opened the lightbox").toHaveCount(0)
    await deleteFromOpenMenu(page, "Launch brief.pdf", "5f11e5a0-0000-4000-8000-000000000101")
  })

  test("as rows, a row's ⋯ takes the pointer and Delete removes the file", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openFiles(page, testInfo)
    await page.getByRole("radio", { name: "List" }).click()
    const row = page.locator("[data-file-row]").filter({ hasText: "Pricing sheet.xlsx" })
    await row.hover()
    const options = row.getByRole("button", { name: "Attachment options" })
    await expectReachable(options)
    await options.click()
    await deleteFromOpenMenu(page, "Pricing sheet.xlsx", "5f11e5a0-0000-4000-8000-000000000102")
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("Link a doc or board finds a doc through the workspace search and links it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { sent, answers } = linking()
    await openFiles(page, testInfo, answers)
    await linkVendorDoc(page, page.getByRole("button", { name: "Link a doc or board" }), true)
    await expect.poll(() => sent).toEqual([{ source_type: "project", source_uuid: P, ref_type: "doc", ref_uuid: VENDOR_DOC.doc_uuid }])
    await expect(page.getByText(VENDOR_DOC.doc_title)).toBeVisible()
  })

  test("a file goes up through Upload, and a row's ⋯ takes the tap and Delete removes the file", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { writes } = await openFiles(page, testInfo)
    await upload(page, writes)
    const row = page.locator("[data-file-row]").filter({ hasText: "Launch brief.pdf" })
    const options = row.getByRole("button", { name: "Attachment options" })
    await expectReachable(options)
    await options.tap()
    await deleteFromOpenMenu(page, "Launch brief.pdf", "5f11e5a0-0000-4000-8000-000000000101")
  })
})

// A project's links for a member who may only read it (V-732, 7 Nov): the
// phone's tab offered Link a doc or board and Unlink to everyone, and the
// server refused the write (canEditSource, 403). Who may link is the
// project's Work Access add_files, as on a computer; anyone who can view the
// project sees what is linked. And a phone drew its "no files" tray (40% of
// the screen) above a project's links when it had no files (V-732 LOW).
const LINKED = { [`/link/source/project/${P}`]: { msg: "ok", data: { docs: [{ ...VENDOR_DOC, doc_read_access: 1 }], boards: [] } } }

for (const [where, size] of [
  ["on a computer", { viewport: { width: 1280, height: 800 } }],
  ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`a project's links ${where}`, () => {
    test.use(size)

    for (const theme of ["light", "dark"] as const) {
      test(`a read-only member sees what is linked, and nothing to link, unlink or upload (${theme})`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.emulateMedia({ colorScheme: theme })
        await openFiles(page, testInfo, LINKED, { access: READER })
        await expect(page.getByRole("button", { name: VENDOR_DOC.doc_title })).toBeVisible()
        await expect(page.getByRole("button", { name: "Link a doc or board" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: "Unlink" })).toHaveCount(0)
        await expect(page.getByRole("button", { name: /^Upload$/ })).toHaveCount(0)
        await reviewShot(page, "files-reader", theme)
      })

      test(`with links and no files, shows them and no "no files" tray (${theme})`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await page.emulateMedia({ colorScheme: theme })
        await openFiles(page, testInfo, LINKED, { files: false })
        await expect(page.getByRole("button", { name: VENDOR_DOC.doc_title })).toBeVisible({ timeout: 60_000 })
        await expect(page.locator("[data-files-empty]")).toHaveCount(0)
        // Someone who may add files can still upload the first.
        await expect(page.getByRole("button", { name: /^Upload$/ }).first()).toBeVisible()
        await reviewShot(page, "files-links-only", theme)
      })
    }

    // With nothing linked and no files, the tray still says so, to the editor and to the reader.
    for (const [who, access] of [["editor", undefined], ["reader", READER]] as const) {
      test(`with no links and no files, the ${who} is told there are none`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openFiles(page, testInfo, { [`/link/source/project/${P}`]: { msg: "ok", data: { docs: [], boards: [] } } }, { access, files: false })
        await expect(page.locator("[data-files-empty]").first()).toBeVisible({ timeout: 60_000 })
        await reviewShot(page, `files-empty-${who}`, "light")
      })
    }
  })
}

// The tray waits for the links: while their read is out, a project with no files never says it has none and then
// jumps (V-732 LOW). The read is held 1.5 s, and the tray is looked for all through it.
test.describe("a project's links on a phone, while they load", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("no \"no files\" tray before the links come", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let asked = 0
    let answer = () => {}
    const held = new Promise<void>((done) => (answer = done))
    await openFiles(page, testInfo, { [`/link/source/project/${P}`]: async () => (asked++, await held, LINKED[`/link/source/project/${P}`]) }, { files: false })
    await expect.poll(() => asked, { timeout: 60_000 }).toBeGreaterThan(0)
    let seen = 0
    for (const end = Date.now() + 1_500; Date.now() < end; await page.waitForTimeout(100)) seen = Math.max(seen, await page.locator("[data-files-empty]").count())
    if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/files-links-loading-390-light.png` })
    expect(seen, "the tray showed while the links were still out").toBe(0)
    answer()
    await expect(page.getByRole("button", { name: VENDOR_DOC.doc_title })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("[data-files-empty]")).toHaveCount(0)
  })
})

// A reader reaches a linked doc by keyboard, with its focus ring (1280).
test.describe("a project's links by keyboard", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("a read-only member tabs to a linked doc", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openFiles(page, testInfo, LINKED, { access: READER })
    const row = page.getByRole("button", { name: VENDOR_DOC.doc_title })
    await expect(row).toBeVisible()
    // Onto the row by the keyboard (back a step and forward again), so it wears the keyboard's ring.
    await row.focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    await expect(row).toBeFocused()
    await reviewShot(page, "files-reader-focus", "light")
  })
})
