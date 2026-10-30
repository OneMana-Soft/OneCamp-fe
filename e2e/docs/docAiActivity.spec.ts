import { expect, test } from "@playwright/test"

import { scrollsInItsBody } from "../sheetLayout"
import { AI_ON, AI_READS, SAM, SHOT_THEMES, reviewShot } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { more, openDocWith, phoneOption } from "./docWith"

// A doc's AI activity (components/ai/DocAiActivityDialog): what the AI did on
// the doc, newest first, from More on a computer and from Document options on
// a phone. A long record scrolls in the dialog's body, and its title, its close
// and Done stay put.

const DOC = "7c2d4e6f-8a1b-4c3d-9e5f-0a1b2c3d4e5f"

const ACTIVITY = Array.from({ length: 24 }, (_, i) => ({
  at: new Date(Date.UTC(2026, 9, 24, 17) - i * 3_600_000).toISOString(),
  action: i % 3 ? "improve" : "summarize",
  status: "allowed",
  summary: i % 3 ? `Improved the launch section, draft ${24 - i}` : `Summarised the doc for the weekly update, week ${24 - i}`,
  actor: SAM.user_full_name,
  seq: 24 - i,
}))

for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test(`a doc's AI activity ${phone ? "on a phone" : "at 1280"} scrolls in its body, its title, close and Done in place (${theme})`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const screen = phone ? { width: 390, height: 844, isMobile: true, hasTouch: true } : { width: 1280, height: 900 }
      const answers = { ...AI_ON, ...AI_READS, "/doc/ai/activity": { msg: "ok", data: ACTIVITY } }
      const tab = await openDocWith(browser, testInfo, new CollabRelay(), SAM, { id: DOC, title: "Launch notes", body: "<p>The plan.</p>" }, answers, screen)
      const { page } = tab
      await page.emulateMedia({ colorScheme: theme })
      if (phone) await phoneOption(page, "AI activity")
      else await more(page, "AI activity")
      const dialog = page.getByRole("dialog", { name: "AI activity on this doc" })
      await expect(dialog.getByRole("list", { name: "AI activity, newest first" }).getByRole("listitem")).toHaveCount(ACTIVITY.length)
      await reviewShot(page, "c5d-ai-activity-open", theme)
      await scrollsInItsBody(page, dialog)
      await reviewShot(page, "c5d-ai-activity-end", theme)
      await tab.close()
    })
  }
}
