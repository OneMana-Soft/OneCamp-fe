import { expect, test, type Page, type Route } from "@playwright/test"

import { SAM } from "../stubbedApp"
import { PRIYA, TableServer } from "./tableServer"
import { hoverWhenReachable } from "../menuReach"

// Comments on a row (tables A8, business/TableComments): a row's record shows
// the threads on the row and on its cells, each saying where it is; a field's
// comment button starts one on its cell; a link that names a thread opens the
// record at it. With TABLE_SHOTS set to a folder, it also saves the record at
// 1280 and 390, light and dark, for the design review.

const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "owner", name: "Owner", type: "text" },
  { id: "stage", name: "Stage", type: "select", config: { options: [{ id: "o_todo000000", label: "To do" }, { id: "o_done000000", label: "Done" }] } },
  { id: "cost", name: "Cost", type: "number" },
]
const rows = [
  { item: "Booth for the launch", owner: "Priya", stage: "To do", cost: 1200 },
  { item: "Printed banners", owner: "Sam", stage: "Done", cost: 340 },
]

type Thread = Record<string, unknown> & { id: string; resource_uuid: string; comments: Record<string, unknown>[] }

/** The threads routes for one table's rows, answered as the API does. */
class ThreadsFake {
  threads: Thread[] = []
  made: { anchor: unknown; body: string }[] = []
  private n = 0

  thread(row: string, by: typeof SAM, html: string, extra: Record<string, unknown> = {}): Thread {
    this.n++
    const id = `7a1d1c2e-0000-4000-8000-${String(this.n).padStart(12, "0")}`
    const at = new Date(Date.UTC(2026, 9, 17, 9, this.n)).toISOString()
    const t: Thread = {
      id,
      resource_kind: "table_row",
      resource_uuid: row,
      anchor: { kind: "none" },
      status: "open",
      created_by: by.user_uuid,
      created_at: at,
      updated_at: at,
      comments: [this.comment(id, by, html, at)],
      participants: [],
      unread: false,
      can_reply: true,
      can_resolve: true,
      can_moderate: true,
      ...extra,
    }
    this.threads.push(t)
    return t
  }

  comment(thread: string, by: typeof SAM, html: string, at: string) {
    this.n++
    return {
      comment_uuid: `c0mment0-0000-4000-8000-${String(this.n).padStart(12, "0")}`,
      thread_id: thread,
      comment_text: html,
      comment_by: { user_uuid: by.user_uuid, user_name: by.user_full_name },
      comment_created_at: at,
    }
  }

  async attach(page: Page) {
    await page.route(
      (url) => url.pathname.includes("/threads"),
      (route: Route) => {
        const req = route.request()
        const origin = req.headers()["origin"] || "*"
        const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" }
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
        const url = new URL(req.url())
        if (req.method() === "GET" && url.pathname.endsWith("/threads")) {
          const row = url.searchParams.get("resource_uuid")
          return route.fulfill({ status: 200, headers, json: { data: { threads: this.threads.filter((t) => t.resource_uuid === row) } } })
        }
        if (req.method() === "POST" && url.pathname.endsWith("/threads")) {
          const body = req.postDataJSON() as { resource_uuid: string; anchor: Record<string, unknown>; body: string }
          this.made.push({ anchor: body.anchor, body: body.body })
          const t = this.thread(body.resource_uuid, SAM, body.body, { anchor: body.anchor })
          return route.fulfill({ status: 200, headers, json: { data: t } })
        }
        return route.fulfill({ status: 200, headers, json: { msg: "ok" } })
      },
    )
  }
}

async function openRecord(server: TableServer, threads: ThreadsFake, options: { width: number; height: number; scheme: "light" | "dark" }) {
  return async (browser: Parameters<TableServer["open"]>[0], testInfo: Parameters<TableServer["open"]>[1]) => {
    const sam = await server.open(browser, testInfo, SAM, { viewport: { width: options.width, height: options.height }, colorScheme: options.scheme })
    await threads.attach(sam.page)
    await sam.page.goto(`/app/tables/${server.id}?row=${server.rows[0].id}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(sam.page.locator("[data-record-panel]")).toBeVisible({ timeout: 60_000 })
    await expect(sam.page.locator("[data-row-comments]")).toBeVisible({ timeout: 30_000 })
    return sam
  }
}

function seed(server: TableServer) {
  const threads = new ThreadsFake()
  const row = server.rows[0].id
  const first = threads.thread(row, PRIYA, "<p>Can we get the booth two days early? The venue opens at nine.</p>")
  first.comments.push(threads.comment(first.id, SAM, "<p>Asked them this morning. Waiting on a yes.</p>", new Date(Date.UTC(2026, 9, 17, 10, 5)).toISOString()))
  threads.thread(row, SAM, "<p>Is this the final quote, or the estimate?</p>", { anchor: { kind: "cell", meta: { field: "cost" } } })
  threads.thread(row, PRIYA, "<p>Owner confirmed.</p>", { status: "resolved", resolved_at: new Date(Date.UTC(2026, 9, 17, 11)).toISOString(), anchor: { kind: "cell", meta: { field: "owner" } } })
  return threads
}

test("a row's record shows its threads where they are, and starts one on a cell", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  const threads = seed(server)
  const sam = await (await openRecord(server, threads, { width: 1280, height: 900, scheme: "light" }))(browser, testInfo)
  const comments = sam.page.locator("[data-row-comments]")
  await expect(comments.getByText("Can we get the booth two days early?")).toBeVisible()
  await expect(comments.getByText("On this row")).toBeVisible()
  await expect(comments.getByText("On Cost")).toBeVisible()
  await expect(comments.getByText("Owner confirmed.")).toHaveCount(0)
  await expect(sam.page.getByRole("button", { name: "Comment on Cost, 1 comment" })).toBeVisible()

  // A field's comment button shows, and takes a click, under the pointer on its field (or with the focus in it): the
  // pointer rests on Stage's row first, as a person's does on the way to the button (V-957).
  const onStage = sam.page.getByRole("button", { name: /^Comment on Stage/ })
  await hoverWhenReachable(sam.page.locator("[data-record-panel] dl > div, [role=dialog] dl > div").filter({ has: onStage }))
  await onStage.click()
  const box = sam.page.getByRole("textbox", { name: "Comment on Stage" })
  await expect(box).toBeFocused()
  await box.pressSequentially("Is this blocked on the venue?")
  await sam.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
  await expect.poll(() => threads.made.length).toBe(1)
  expect(threads.made[0].anchor).toEqual({ kind: "cell", meta: { field: "stage" } })
  await expect(comments.getByText("Is this blocked on the venue?")).toBeVisible()
  await sam.close()
})

const shots = process.env.TABLE_SHOTS
for (const [width, height] of [
  [1280, 900],
  [390, 844],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`the record with its comments, ${width} ${scheme}`, async ({ browser }, testInfo) => {
      test.skip(!shots, "shots only when TABLE_SHOTS names a folder")
      const server = new TableServer(fields, rows)
      const threads = seed(server)
      const sam = await (await openRecord(server, threads, { width, height, scheme }))(browser, testInfo)
      await sam.page.locator("[data-row-comments]").scrollIntoViewIfNeeded()
      await sam.page.screenshot({ path: `${shots}/row-comments-${width}-${scheme}.png`, animations: "disabled" })
      await sam.close()
    })
  }
}

// V-1042: the record's comment box rests as an editable line until it is asked for (CommentComposer's waitForUse), so a
// record opened or stepped to makes no editor. Asked for, by a click or by the keyboard's Tab, the editor comes in with
// the caret, and a comment typed at once lands whole (what reached the line first is handed over) and sends.
test("V-1042 at 1280: the row's comment box rests with no editor; a click, or Tab, brings it in with the caret, and a comment typed at once lands and sends", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  const threads = seed(server)
  const open = await openRecord(server, threads, { width: 1280, height: 900, scheme: "light" })
  // By the mouse.
  const sam = await open(browser, testInfo)
  const box = sam.page.locator("[data-row-comment-box]")
  const line = box.getByRole("textbox", { name: "Comment on this row" })
  const editor = box.locator(".ProseMirror")
  await expect(line).toBeVisible()
  await expect(editor, "no editor at rest").toHaveCount(0)
  await line.click()
  await sam.page.keyboard.type("Can the stage go up a day early?")
  await expect(editor, "the click: the editor, the caret in it").toBeFocused()
  await expect(editor).toHaveText("Can the stage go up a day early?")
  await expect(box.getByRole("textbox", { name: "Comment on this row" }), "one box by its name").toHaveCount(1)
  await sam.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter")
  await expect.poll(() => threads.made.length).toBe(1)
  expect(threads.made[0].body).toContain("Can the stage go up a day early?")
  await sam.close()

  // By the keyboard: Tab from the record's first control reaches the line, and the editor takes the focus from it.
  const again = await open(browser, testInfo)
  const box2 = again.page.locator("[data-row-comment-box]")
  await expect(box2.getByRole("textbox", { name: "Comment on this row" })).toBeVisible()
  await again.page.locator("[data-record-panel]").locator("button, input, textarea, [contenteditable=true]").first().focus()
  const inBox = () => box2.evaluate((b) => b.contains(document.activeElement))
  for (let i = 0; i < 80 && !(await inBox()); i++) await again.page.keyboard.press("Tab")
  await again.page.keyboard.type("Owner confirmed")
  await expect(box2.locator(".ProseMirror"), "Tab: the editor, the caret in it").toBeFocused()
  await expect(box2.locator(".ProseMirror")).toHaveText("Owner confirmed")
  await again.close()
})

// V-1225 (MAIN's ruling): every composer with an editor looks the same at rest, so the row's box shows @ beside send
// before its editor is made; a press of @ there makes the editor and starts a mention in it, the people's list open.
test("V-1225 at 1280: the row's comment box shows @ beside send at rest, and a click on it starts a mention", async ({ browser }, testInfo) => {
  const server = new TableServer(fields, rows)
  const threads = seed(server)
  const sam = await (await openRecord(server, threads, { width: 1280, height: 900, scheme: "light" }))(browser, testInfo)
  const box = sam.page.locator("[data-row-comment-box]")
  const at = box.getByRole("button", { name: "Mention someone" })
  await expect(box.getByRole("textbox", { name: "Comment on this row" })).toBeVisible()
  await expect(box.locator(".ProseMirror"), "no editor at rest").toHaveCount(0)
  await expect(at, "@ at rest").toBeVisible()
  const send = await box.getByRole("button", { name: "Comment", exact: true }).boundingBox()
  const atBox = await at.boundingBox()
  expect(atBox && send && atBox.x < send.x, "@ beside send, before it").toBe(true)
  await at.click()
  const editor = box.locator(".ProseMirror")
  await expect(editor, "the click: the editor, the caret in it").toBeFocused()
  await expect(editor).toHaveText("@")
  const list = sam.page.getByRole("listbox", { name: /^Mention/ })
  // The list names people by their username, the one asking first: "pri" leaves Priya, whom Enter takes.
  await expect(list.getByRole("option", { name: /priya/i })).toBeVisible({ timeout: 15_000 })
  await sam.page.keyboard.type("pri")
  await expect(editor).toHaveText("@pri")
  await sam.page.keyboard.press("Enter")
  await expect(editor.locator("[data-type=mention], .mention").first()).toContainText(/priya/i)
  await sam.close()
})
