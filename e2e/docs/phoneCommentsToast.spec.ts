import { expect, test } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// A doc's comment pages (V-1105): on a phone the comments list and a thread
// own the screen's foot with their composer's bar; on a wide screen the
// comments are a panel, and no foot is published.

const DOC = "d0c11050-0000-4000-8000-000000001105"
const THREAD = "00000000-0000-4000-8000-000000001105"
const now = new Date().toISOString()

const thread = {
  id: THREAD,
  resource_kind: "doc",
  resource_uuid: DOC,
  anchor: { kind: "none" },
  status: "open",
  created_by: SAM.user_uuid,
  created_at: now,
  updated_at: now,
  comments: [{ comment_uuid: `${THREAD}-c1`, thread_id: THREAD, comment_text: "<p>Can we say Friday in the headline?</p>", comment_by: SAM, comment_created_at: now }],
  participants: [],
  unread: false,
  can_reply: true,
  can_resolve: true,
  can_moderate: true,
}

const answers = {
  "/threads": (url: URL, request: { method(): string }) => {
    if (request.method() !== "GET") return { msg: "ok", data: {} }
    return url.pathname === "/threads" ? { msg: "ok", data: { threads: [thread] } } : { msg: "ok", data: thread }
  },
}

test("a wide screen's comments are a panel: no foot is published", async ({ browser }, testInfo) => {
  test.setTimeout(240_000)
  const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, body: "<p>Launch on Friday</p>" }, answers, { width: 1280, height: 900 })
  await tab.page.goto(`/app/doc/${DOC}/comment`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(tab.page.getByRole("textbox", { name: "Comment on the page" })).toBeVisible({ timeout: 60_000 })
  // The panel's own composer (components/rightPanel/docCommentList) is no phone foot.
  await expect(tab.page.locator("[data-phone-foot]")).toHaveCount(0)
  expect(await tab.page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--mobile-drawer-h").trim())).toBe("")
  await tab.close()
})
