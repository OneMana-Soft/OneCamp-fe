import { expect, test, type Page, type Request } from "@playwright/test"

import { expectReachable } from "./menuReach"
import { SAM, stubBackend } from "./stubbedApp"

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

const P = "5f11e5a0-0000-4000-8000-0000000000f1"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
const ADMIN = {
  role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true,
  post_updates: true, add_files: true, manage: true, manage_people: true, archive: true,
}
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
const file = (n: number, name: string, type: string, raw: string) => ({
  attachment_uuid: `5f11e5a0-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
  attachment_file_name: name, attachment_obj_key: `${SAM.user_uuid}/${n}_${name}`, attachment_size: 48_000,
  attachment_type: type, attachment_raw_type: raw, attachment_created_at: "2026-10-20T09:00:00Z",
})

/** The tab, its reads and the file writes answered here; returns the writes it was sent. */
async function openFiles(page: Page, testInfo: Parameters<typeof stubBackend>[1]) {
  const files = [file(1, "Launch brief.pdf", "document", "application/pdf"), file(2, "Pricing sheet.xlsx", "document", "application/vnd.ms-excel")]
  const writes: { path: string; body: unknown }[] = []
  let n = 10
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
  })
  await stubBackend(page, testInfo, {
    [`/project/attachments/${P}`]: () => ({ msg: "got project attachment list!", data: { ...project, project_attachments: files.slice() } }),
    [`/project/getFile/${P}/`]: { msg: "Got the url!", url: `data:image/png;base64,${PNG.toString("base64")}` },
    "/uploadFile": () => {
      writes.push({ path: "/uploadFile", body: null })
      return { msg: "successfully Uploaded !", object_uuid: `5f11e5a0-0000-4000-8000-0000000001${n++}` }
    },
    "/project/addAttachment": (_url: URL, req: Request) => {
      const body = req.postDataJSON() as { project_attachments: Array<Record<string, unknown>> }
      writes.push({ path: "/project/addAttachment", body })
      for (const a of body.project_attachments) files.push({ ...(a as ReturnType<typeof file>), attachment_obj_key: `${SAM.user_uuid}/${a.attachment_uuid}` })
      return { msg: "ok" }
    },
    "/project/removeAttachment": (_url: URL, req: Request) => {
      const body = req.postDataJSON() as { attachment_obj_key: string }
      writes.push({ path: "/project/removeAttachment", body })
      const at = files.findIndex((f) => f.attachment_uuid === body.attachment_obj_key)
      if (at >= 0) files.splice(at, 1)
      return { status: "success", data: body.attachment_obj_key }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    "/notices": { msg: "ok", data: { notices: [] } },
  })
  await page.goto(`/app/project/${P}?tab=attachments`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Launch brief.pdf").first()).toBeVisible({ timeout: 60_000 })
  return { writes }
}

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
