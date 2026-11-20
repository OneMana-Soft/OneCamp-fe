import { expect, test, type Locator, type Page } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

/**
 * PRIORITY TRIAGE YOU CAN CLEAR (A4 H5). A Priority row's "Remove from
 * Priority" takes it out at once and writes POST /activity/dismiss with the
 * server's key of it; the toast's Undo writes it back. Offline, the write
 * fails and the row stays, with words saying so. On a phone the row's tools
 * are one drawer away: Actions opens a sheet of them, in their own words
 * (V-704). At 1280 and at 390 with touch, light and dark.
 */

const JONAS = { user_uuid: "3c9d1e7a-5b2f-4c8e-9a1d-6f0b2e4c8a1d", user_name: "Jonas", user_full_name: "Jonas Weber" }
const LAUNCH = "8a4f2c6e-1d3b-4e5f-9c7a-2b6d8e0f1a3c"

/**
 * The server's side: what was posted, what it has taken out of Priority, and when the items were made. An item keeps
 * its time across fetches, as a real server's does: a time taken at each fetch re-keyed the row on the refetch after a
 * write, so it was drawn anew and dropped the focus the list had handed on (CR-333 F2).
 */
type Server = { posts: { keys: string[]; dismissed: boolean }[]; out: Set<string>; now: number }

/** A mention that asks the reader something, as the server sends it: high until taken out. */
function ask(server: Server, key: string, text: string, minutesAgo: number) {
  const at = new Date(server.now - minutesAgo * 60_000).toISOString()
  const out = server.out.has(key)
  return {
    activity_type: "MENTION",
    key,
    dismissed: out,
    time: at,
    priority: out ? "normal" : "high",
    unread: true,
    actor_kind: "person",
    mention: {
      mention_created_at: at,
      mention_post_uuid: `post-${key}`,
      mention_post: { post_uuid: `post-${key}`, post_text: text, post_created_at: at, post_channel: { ch_uuid: LAUNCH, ch_name: "launch" }, post_by: JONAS },
    },
  }
}

async function inbox(page: Page, testInfo: Parameters<typeof stubBackend>[1]) {
  const server: Server = { posts: [], out: new Set(), now: Date.now() }
  await stubBackend(page, testInfo, {
    "/activity/unified": () => ({
      msg: "ok",
      data: {
        has_more: false,
        activities: [ask(server, "mention:rollback", "Can you check the rollback steps before Friday?", 5), ask(server, "mention:signoff", "Could you sign off the launch post?", 40)],
      },
    }),
    "/activity/dismiss": (_url: URL, request: { postDataJSON: () => unknown }) => {
      const sent = request.postDataJSON() as { keys: string[]; dismissed: boolean }
      server.posts.push(sent)
      for (const key of sent.keys) {
        if (sent.dismissed) server.out.add(key)
        else server.out.delete(key)
      }
      return { msg: "ok" }
    },
    "/activity/seen": { msg: "ok", data: { count: 0 } },
    "/activity/unread": { msg: "ok", data: { count: 2 } },
    "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
  })
  await page.goto("/app/inbox?tab=priority", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const rollback = page.locator("[data-feed-row]").filter({ hasText: "rollback steps" })
  await expect(rollback).toBeVisible({ timeout: 60_000 })
  return { server, rollback }
}

/** A toast by its words (the toast's card, not its announcement). */
const toastOf = (page: Page, words: string) => page.locator(".toast-card").filter({ hasText: words })

/** The Priority tab's count: its digits, or "" with none. */
const priorityCount = async (page: Page) => ((await page.locator('[data-tab="priority"]').textContent()) ?? "").replace(/\D/g, "")

for (const theme of ["light", "dark"] as const) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      /** Presses one of the row's tools: under the pointer on a computer, from the row's drawer on a phone. */
      async function useTool(page: Page, row: Locator, name: string) {
        if (!phone) {
          await row.hover()
          await row.getByRole("button", { name }).click()
          return
        }
        await row.getByRole("button", { name: "Actions" }).tap()
        const sheet = page.getByRole("menu")
        await expect(sheet).toBeVisible()
        await sheet.getByRole("menuitem", { name }).tap()
        await expect(sheet).toBeHidden()
      }

      test("Remove from Priority takes the row out with a toast, and Undo brings it back", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { server, rollback } = await inbox(page, testInfo)
        await expect.poll(() => priorityCount(page)).toBe("2")

        if (phone) {
          // V-704: the drawer, its rows in the tools' own words, never a tray of bare icons.
          await rollback.getByRole("button", { name: "Actions" }).tap()
          const sheet = page.getByRole("menu")
          await expect(sheet).toBeVisible()
          const words = (await sheet.getByRole("menuitem").allTextContents()).map((w) => w.trim())
          expect(words).toEqual(expect.arrayContaining(["Mark read", "Remove from Priority", "Why am I seeing this?", "Open"]))
          expect(words.every((w) => w.length > 0), "every row of the drawer has words").toBe(true)
          await expect(rollback.locator(".hub-row-tools")).toBeHidden()
          await reviewShot(page, "priority-drawer", theme)
          await page.keyboard.press("Escape")
          await expect(sheet).toBeHidden()
        } else {
          await rollback.hover()
          await expect(rollback.getByRole("button", { name: "Remove from Priority" })).toBeVisible()
          await reviewShot(page, "priority-tools", theme)
        }

        await useTool(page, rollback, "Remove from Priority")
        await expect(rollback).toBeHidden()
        // CR-333 F2: the focus goes on to the row that's left, never to <body> with the drawer's Actions.
        if (phone) await expect(page.locator("[data-hub-row]:focus-within")).toHaveCount(1)
        await expect.poll(() => priorityCount(page)).toBe("1")
        await expect(toastOf(page, "Removed from Priority")).toBeVisible()
        expect(server.posts).toEqual([{ keys: ["mention:rollback"], dismissed: true }])
        await reviewShot(page, "priority-removed", theme)

        await toastOf(page, "Removed from Priority").getByRole("button", { name: "Undo" }).click()
        await expect(rollback).toBeVisible()
        await expect.poll(() => priorityCount(page)).toBe("2")
        expect(server.posts.at(-1)).toEqual({ keys: ["mention:rollback"], dismissed: false })

        // Taken out again, it lasts: All shows it with Back to Priority, past the toast.
        await useTool(page, rollback, "Remove from Priority")
        await expect(rollback).toBeHidden()
        await page.getByRole("tab", { name: /^All/ }).click()
        const inAll = page.locator("[data-feed-row]").filter({ hasText: "rollback steps" })
        await expect(inAll).toBeVisible()
        if (!phone) await inAll.hover()
        else await inAll.getByRole("button", { name: "Actions" }).tap()
        await expect((phone ? page.getByRole("menu") : inAll).getByRole(phone ? "menuitem" : "button", { name: "Back to Priority" })).toBeVisible()
        await reviewShot(page, "priority-back", theme)
        if (phone) await page.keyboard.press("Escape")
      })

      test("offline, the write fails: the row stays in Priority and the toast says it didn't", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const { server, rollback } = await inbox(page, testInfo)
        await expect.poll(() => priorityCount(page)).toBe("2")
        // Loaded online first, as a phone is before it loses the network: the row's drawer came ahead.
        await page.waitForLoadState("networkidle")
        // Offline: the page knows it, and the write never reaches the server (a route still answers offline).
        await page.context().setOffline(true)
        await page.route("**/activity/dismiss", (route) => route.abort("internetdisconnected"))
        await useTool(page, rollback, "Remove from Priority")
        await expect(toastOf(page, "Couldn't take it out of Priority")).toBeVisible()
        await expect(rollback).toBeVisible()
        await expect.poll(() => priorityCount(page)).toBe("2")
        await expect(toastOf(page, "Removed from Priority")).toHaveCount(0)
        expect(server.posts).toEqual([])
        await page.context().setOffline(false)
        await reviewShot(page, "priority-offline", theme)
      })
    })
  }
}
