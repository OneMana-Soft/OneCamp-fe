import { expect, test, type Locator, type Request } from "@playwright/test"

import { SAM, stubBackend } from "../stubbedApp"
import { SCHEMES, SCREENS, press, screenUse } from "../screens"
import { CollabRelay } from "./collabRelay"
import { openDocWith } from "./docWith"

// The client loop on a shared doc (docs C5-2), in a real browser, on a
// computer and on a phone by touch, light and dark. A comment link's guest
// sees the team's reply straight under their comment, named as the team and
// never tagged Guest, and approves the doc. The team sees the client's
// verdict and the guests' comments under the doc's threads, answers one where
// the guest sees it, and removes one. Every request is answered here; nothing
// reaches a server.

const TOKEN = "ClientLoopToken0001abcd"
const DOC = "5b6e2f1c-9d3a-4c6e-8f7b-0a1b2c3d4e5f"
const at = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
const COMMENTS = [
  { id: "c1", guest_name: "Dana", body: "Is section 2 final?", created_at: at(60), author_id: "guest-a" },
  { id: "c2", guest_name: "Dana", body: "And the dates?", created_at: at(50), author_id: "guest-a" },
  { id: "r1", guest_name: "Maya from Acme Studio", body: "Yes, section 2 is final.", created_at: at(40), parent_id: "c1", from_team: true },
]

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("a guest sees the team's reply under their comment, and approves the doc", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const sent: Array<{ path: string; body: unknown }> = []
        page.on("request", (r) => {
          if (r.method() === "POST") sent.push({ path: new URL(r.url()).pathname, body: r.postDataJSON?.() ?? null })
        })
        await stubBackend(page, testInfo, {
          [`/guest/collab/${TOKEN}`]: { msg: "ok", data: { collab_token: "jwt", document_name: DOC, resource_type: "doc", resource_id: DOC, capability: "comment", title: "Proposal" } },
          [`/guest/doc-comments/${TOKEN}`]: { msg: "ok", data: { capability: "comment", workspace_name: "Acme Studio", comments: COMMENTS } },
          [`/guest/doc-review/${TOKEN}`]: { msg: "ok", data: { review: { decision: "approved", name: "Dana", created_at: at(0) } } },
        })
        await page.goto(`/guest/d/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const comments = page.locator("[data-guest-comments]")
        await expect(comments).toBeVisible({ timeout: 60_000 })

        // The reply sits straight under the comment it answers, as the team's.
        const items = comments.locator("li")
        await expect(items).toHaveCount(3)
        await expect(items.nth(1)).toHaveAttribute("data-guest-reply", "")
        await expect(items.nth(1)).toContainText("Maya from Acme Studio")
        await expect(items.nth(1)).not.toContainText("Guest")
        await expect(items.nth(2)).toContainText("And the dates?")

        // The comment box and the verdict's note grow with what's written, up to 240 px, then scroll (the shared Textarea).
        const capped = async (field: Locator) => {
          const rows = await field.evaluate((el) => el.getBoundingClientRect().height)
          await field.fill(Array.from({ length: 40 }, (_, i) => `Line ${i + 1}`).join("\n"))
          await expect
            .poll(() => field.evaluate((el) => ({ height: Math.round(el.getBoundingClientRect().height), scrolls: el.scrollHeight > el.clientHeight })))
            .toEqual({ height: 240, scrolls: true })
          expect(rows).toBeLessThan(240)
          await field.fill("")
        }
        await capped(comments.locator('textarea[name="comment"]'))
        const verdictBox = page.locator('[data-guest-verdict=""]')
        await press(screen, verdictBox.getByRole("button", { name: "Request changes" }))
        await capped(verdictBox.getByLabel("What should change?"))
        await press(screen, verdictBox.getByRole("button", { name: "Cancel" }))

        // The verdict, which needs the guest's name first.
        const approve = page.getByRole("button", { name: "Approve doc" })
        await approve.scrollIntoViewIfNeeded()
        await press(screen, approve)
        await expect(page.getByLabel("Your name")).toBeFocused()
        expect(sent.filter((s) => s.path.startsWith("/guest/doc-review/"))).toEqual([])
        await page.getByLabel("Your name").fill("Dana")
        await press(screen, approve)
        await expect(page.locator('[data-guest-verdict="approved"]')).toContainText("approved this doc")
        await expect.poll(() => sent.find((s) => s.path === `/guest/doc-review/${TOKEN}`)?.body).toEqual({ display_name: "Dana", decision: "approved", note: "" })
      })

      test("the team sees the client's verdict and the guests' comments, answers one and removes one", async ({ browser }, testInfo) => {
        test.setTimeout(180_000)
        const replies: unknown[] = []
        const removed: unknown[] = []
        const relay = new CollabRelay()
        const tab = await openDocWith(
          browser,
          testInfo,
          relay,
          SAM,
          { id: DOC, title: "Proposal" },
          {
            "/doc/guest-thread/reply": (_url: URL, request: Request) => {
              replies.push(request.postDataJSON())
              return { msg: "ok", data: { id: "r2", guest_name: "Sam from Acme Studio", body: "The dates hold.", created_at: at(0), parent_id: "c2", from_team: true } }
            },
            "/doc/guest-thread/remove": (_url: URL, request: Request) => {
              removed.push(request.postDataJSON())
              return { msg: "ok" }
            },
            "/doc/guest-thread": { msg: "ok", data: { comments: COMMENTS, can_reply: true, can_moderate: true } },
            "/doc/client-review": { msg: "ok", data: { review: { decision: "changes", name: "Dana", note: "Move the launch to May.", created_at: at(30) } } },
          },
          screen,
        )
        await tab.page.emulateMedia({ colorScheme: scheme })
        const page = tab.page
        if (screen.isMobile) {
          await press(screen, page.getByRole("button", { name: "Document options" }))
          await press(screen, page.getByRole("button", { name: "Comments" }).or(page.getByRole("menuitem", { name: "Comments" })).first())
        } else {
          await page.getByRole("button", { name: /^Comments, / }).click()
        }
        const guests = page.locator("[data-guest-conversation]")
        await expect(guests).toBeVisible({ timeout: 30_000 })
        const verdict = guests.locator('[data-doc-verdict="changes"]')
        await expect(verdict).toContainText("Dana asked for changes")
        await expect(verdict).toContainText("Move the launch to May.")
        await expect(guests.locator('[data-guest-comment="team"]')).toContainText("Visible to guest")

        const second = guests.locator("[data-guest-thread]", { hasText: "And the dates?" })
        await press(screen, second.getByRole("button", { name: "Reply" }))
        await second.getByRole("textbox", { name: "Reply to Dana, visible to them" }).fill("The dates hold.")
        await press(screen, second.getByRole("button", { name: "Reply to guest" }))
        await expect.poll(() => replies).toEqual([{ doc_uuid: DOC, parent_id: "c2", body: "The dates hold." }])

        await press(screen, second.getByRole("button", { name: "More for Dana's comment" }))
        const remove = screen.isMobile ? page.locator("[data-guest-comment-sheet]").getByRole("button", { name: "Remove" }) : page.getByRole("menuitem", { name: "Remove" })
        await press(screen, remove)
        await press(screen, page.getByRole("button", { name: "Remove comment" }))
        await expect.poll(() => removed).toEqual([{ doc_uuid: DOC, comment_id: "c2" }])
        await tab.close()
      })
    })
  }
}
