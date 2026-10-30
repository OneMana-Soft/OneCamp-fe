import { expect, type Locator, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

/**
 * The inbox with one notice (a doc mention), drawn by HubRow as every hub list
 * draws its rows; returns the row. For the hub rows' touch checks
 * (hubRowTouch) and the reach scan (reachScan).
 */
export const DOC = "7d1e5c2a-9b3f-4a6e-8c1d-2f4b6a8e0c3d"
const AKASH = { user_uuid: "5b8f2c1e-3d4a-4e6f-9a0b-1c2d3e4f5a6b", user_name: "Akash", user_full_name: "Akash" }

export async function inboxWithANotice(page: Page, testInfo: TestInfo): Promise<Locator> {
  const now = new Date().toISOString()
  await stubBackend(page, testInfo, {
    "/activity/unified": {
      msg: "ok",
      data: {
        has_more: false,
        activities: [
          {
            activity_type: "NOTICE",
            time: now,
            priority: "normal",
            actor_kind: "person",
            notice: {
              id: "0b9e6a52-1c3d-4f7e-8a2b-5c6d7e8f9a0b",
              kind: "doc.mentioned",
              resource_kind: "doc",
              resource_uuid: DOC,
              title: "Launch notes",
              can_open: true,
              reason: "mention",
              actor: AKASH,
              created_at: now,
            },
          },
        ],
      },
    },
  })
  await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const row = page.locator("[data-feed-row]").first()
  await expect(row).toBeVisible({ timeout: 60_000 })
  return row
}
