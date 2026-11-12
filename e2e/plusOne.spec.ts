import { expect, test, type Request } from "@playwright/test"
import { openChannel, VIEWS } from "./channelPage"
import { reviewShot } from "./stubbedApp"

// "+1" STAYS "+1" (UX-CHAT-H3, the audit's CHAT-03), in a real browser with no
// backend, at 1280 and at 390 with touch, light and dark. "+" at a word's
// start opened the work picker and searched for "1": with "Q1 launch
// checklist" highlighted, Enter posted that task's chip in place of "+1". Now
// "+1" is text, nothing is searched for, and it posts as "+1"; "+la" still
// opens the picker. With SHOTS_DIR=<dir> the typed and the sent "+1", the bare
// "+" and the picker are saved.

const TASK = { type: "task", task: { task_id: "0c4a0000-0000-4000-8000-0000000000a1", task_name: "Q1 launch checklist", task_assignee_user_full_name: "Maya Chen" } }

for (const view of VIEWS) {
  for (const scheme of ["light", "dark"] as const) {
    test(`at ${view.name}, ${scheme}: '+1' posts '+1' in #launch, and '+la' still opens the work picker`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const searched: string[] = []
      const posted: Array<{ post_text_html?: string }> = []
      const tab = await openChannel(browser, testInfo, view, scheme, () => ({
        "/search/unifiedSearch": (_url: URL, request: Request) => {
          searched.push((request.postDataJSON() as { global_search_text: string }).global_search_text)
          return { msg: "ok", data: { page: [TASK] } }
        },
        "/po/createPost": (_url: URL, request: Request) => {
          posted.push(request.postDataJSON() as { post_text_html?: string })
          return { msg: "ok", data: { post_uuid: "0c4a0000-0000-4000-8000-0000000005f1", post_created_at: new Date().toISOString() } }
        },
      }))

      const box = view.phone ? tab.locator("[data-phone-composer] [contenteditable='true']") : tab.locator("[contenteditable='true']").last()
      await expect(box).toBeVisible()
      await box.click()
      await box.pressSequentially("+1")
      await expect(box).toContainText("+1")
      // Past the picker's search pause: nothing was searched for, and no picker stands over the box.
      await tab.waitForTimeout(600)
      expect(searched).toEqual([])
      // The list itself is gone, not only its rows: an empty menu standing over the box would fail here.
      await expect(tab.locator("[data-reference-list]")).toHaveCount(0)
      await reviewShot(tab, "plus-one-typed", scheme)

      // A finger taps Send: a mouse click on a touch screen would leave a hover tooltip in the frame.
      if (view.phone) await tab.getByRole("button", { name: "Send" }).last().tap()
      else await box.press("Enter")
      await expect.poll(() => posted.length, { timeout: 30_000 }).toBe(1)
      expect(posted[0].post_text_html).toContain("+1")
      expect(posted[0].post_text_html).not.toContain("entityMention")
      await expect(tab.locator("[data-message-row]").getByText("+1", { exact: true }).first()).toBeVisible({ timeout: 30_000 })
      await expect(box).not.toContainText("+1")
      await reviewShot(tab, "plus-one-sent", scheme)

      // A bare "+" is still text: no hint, no list, and nothing searched for.
      await box.click()
      await box.pressSequentially("+")
      await tab.waitForTimeout(600)
      expect(searched).toEqual([])
      await expect(tab.locator("[data-reference-list]")).toHaveCount(0)
      await reviewShot(tab, "plus-alone", scheme)
      // A letter after "+" is a request for work: the picker opens and finds the task.
      await box.pressSequentially("la")
      const row = tab.locator("[data-reference-list] [role='option']").filter({ hasText: "Q1 launch checklist" })
      await expect(row).toBeVisible({ timeout: 30_000 })
      expect(searched.at(-1)).toBe("la")
      await reviewShot(tab, "plus-letter-picker", scheme)
      await box.press("Escape")
      await tab.context().close()
    })
  }
}
