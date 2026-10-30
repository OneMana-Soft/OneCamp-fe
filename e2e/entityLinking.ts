import { expect, type Locator, type Page, type Request } from "@playwright/test"

import type { Answers } from "./stubbedApp"

/** The doc the workspace search finds for "vendor". */
export const VENDOR_DOC = { doc_uuid: "0d0c0000-0000-4000-8000-0000000000e1", doc_title: "Vendor contracts" }

/**
 * The workspace search and the link write behind Link a doc or board
 * (components/entityLink/EntityLinkPicker), with the links it was sent. The
 * search finds a task too, which the picker never offers.
 */
export function linking() {
  const sent: unknown[] = []
  const answers: Answers = {
    "/search/unifiedSearch": { msg: "ok", data: { page: [{ type: "task", task: { task_uuid: "0d0c0000-0000-4000-8000-0000000000e2", task_name: "Vendor review" } }, { type: "doc", doc: VENDOR_DOC }], has_more: false } },
    "/link/add": (_url: URL, request: Request) => {
      sent.push(request.postDataJSON())
      return { msg: "ok", data: { docs: [{ ...VENDOR_DOC, doc_read_access: 1 }], boards: [] } }
    },
  }
  return { sent, answers }
}

/**
 * Opens the picker from its trigger (by touch on a phone), finds "vendor",
 * and picks the doc, which closes the picker.
 */
export async function linkVendorDoc(page: Page, trigger: Locator, touch: boolean) {
  const press = (target: Locator) => (touch ? target.tap() : target.click())
  await trigger.scrollIntoViewIfNeeded()
  await press(trigger)
  const search = page.getByPlaceholder("Search docs and boards…")
  await search.fill("vendor")
  const found = page.getByRole("button", { name: VENDOR_DOC.doc_title })
  await expect(found).toBeVisible()
  await expect(page.getByRole("button", { name: "Vendor review" })).toHaveCount(0)
  await press(found)
  await expect(search).toHaveCount(0)
}
