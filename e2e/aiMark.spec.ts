import { expect, test } from "@playwright/test"

import { VIEWS, openChannel } from "./channelPage"
import { AI_ON, AI_READS, SHOT_THEMES, reviewShot } from "./stubbedApp"

// UX-DS-H4 (foundation 2): the AI has one mark. Its face is the agent square
// (AiMark), and inside a control it is motifs' Spark in the agent colour:
// never lucide's sparkles, which people read as "favourite" or "magic". The
// composer's Draft with AI (its "+" menu at 1280, the same menu as a sheet at
// 390 with touch) and the AI's own page header draw it, light and dark.

const SPARKLES = "svg.lucide-sparkles, svg.lucide-sparkle, svg.lucide-wand-sparkles"
/** motifs' Spark (components/ui/graphics/motifs.tsx), known by its path: SPARK_PATH begins so. */
const SPARK = 'svg:not(.lucide) > path[d^="M12 2.5c.5 4.6 2.9 7 9.5 9.5"]'
/** The AI page's own reads, answered empty: no conversations yet, the workspace's model; at 1280 the channel's agent cards and memory switch. */
const AI_PAGE = {
  "/agent-card/channel": { msg: "ok", data: [] },
  "/ai/memory/channel-exclusion": { msg: "ok", data: { excluded: false } },
  "/ai/conversations": { msg: "ok", data: [] },
  "/ai/models": { msg: "ok", data: { models: [], default: "" } },
  "/ai/model": { msg: "ok", data: { enabled: true } },
  "/ai/suggestions": { msg: "ok", data: [] },
}

for (const view of VIEWS) {
  for (const scheme of SHOT_THEMES) {
    test(`at ${view.name}, ${scheme}: Draft with AI and the AI's page wear the agent mark, never sparkles`, async ({ browser }, testInfo) => {
      test.setTimeout(300_000)
      const tab = await openChannel(browser, testInfo, view, scheme, () => ({ ...AI_READS, ...AI_ON, ...AI_PAGE }))

      const plus = (view.phone ? tab.locator("[data-phone-composer]") : tab).getByRole("button", { name: "Add to the message" }).first()
      if (view.phone) await plus.tap()
      else await plus.click()
      const menu = tab.getByRole("menu")
      const draft = menu.getByRole("menuitem", { name: /Draft with AI/ })
      await expect(draft).toBeVisible()
      await expect(draft.locator(SPARK)).toBeVisible()
      await expect(menu.locator(SPARKLES)).toHaveCount(0)
      await reviewShot(tab, "ds-h4-draft-with-ai", scheme)
      await tab.keyboard.press("Escape")
      await expect(menu).toBeHidden()

      if (!view.phone) {
        await tab.goto("/app/ai", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const header = tab.locator("[data-ai-header]")
        await expect(header.locator("[data-ai-mark]")).toBeVisible({ timeout: 90_000 })
        await expect(header.getByRole("heading", { name: "OneCamp AI" })).toBeVisible()
        await expect(tab.locator("[data-ai-panel]").locator(SPARKLES)).toHaveCount(0)
        await reviewShot(tab, "ds-h4-ai-page", scheme)
      }
      await tab.context().close()
    })
  }
}
