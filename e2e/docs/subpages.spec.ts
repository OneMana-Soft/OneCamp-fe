import { expect, test, type Browser, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, docInfo, reviewShot, withStatus, type Answers } from "../stubbedApp"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs, type DocTab, type OpenAs, type Person } from "./twoPeople"
import { grip, hover, menu } from "./blockHandle"

// A doc's pages in its body and in the tree (docs C7a), in two browsers on
// the relay. Deleting a child page's block puts the page in the trash, and the
// toast's Undo or ⌘Z brings back both, while the other person's tab, which
// sees the block go, asks nothing. Pages inside lists the pages inside that
// have no block, and Add to page puts one at the end. The block menu's Move
// to… moves the page itself. Every API call is answered here, by a tree kept
// in the test: nothing reaches a real server.

const DOC = "c7a40000-0000-4000-8000-000000000001"
const NOTES = "c7a40000-0000-4000-8000-000000000002"
const BUDGET = "c7a40000-0000-4000-8000-000000000003"
const ENG = "c7a40000-0000-4000-8000-000000000004"
const TITLES: Record<string, string> = { [DOC]: "Launch plan", [NOTES]: "Launch notes", [BUDGET]: "Launch budget", [ENG]: "Engineering" }

// In order, one worker; a failure leaves the others to run (each has its own relay and tree).
test.describe.configure({ mode: "default", timeout: 120_000 })

type Ref = { kind: string; id: string }
const sent = (request: Request) => (request.postDataJSON() ?? {}) as Record<string, string | boolean | Ref[]>

/** The tree and the trash as the server keeps them, and what each tab asked of them, in order. */
class Tree {
  readonly parent = new Map<string, string>([
    [NOTES, DOC],
    [BUDGET, DOC],
  ])
  readonly trashed = new Set<string>()
  readonly calls: string[] = []

  private read(ref: Ref) {
    if (ref.kind !== "doc" || !TITLES[ref.id] || this.trashed.has(ref.id)) return { ...ref, access: "gone" }
    return { ...ref, access: "ok", data: { title: TITLES[ref.id], parent_id: this.parent.get(ref.id) } }
  }

  private inside(parent: string) {
    return [...this.parent].filter(([id, p]) => p === parent && !this.trashed.has(id)).map(([id]) => ({ kind: "doc", uuid: id, title: TITLES[id], has_children: false }))
  }

  /** The answers a person's tab gets: each write is noted in calls with who asked. */
  answers(who: Person): Answers {
    const name = who.user_name
    return {
      "/entities": (_url: URL, request: Request) => ({ msg: "ok", data: (sent(request).refs as Ref[]).map((r) => this.read(r)) }),
      "/doc/children": (url: URL) => {
        const nodes = url.searchParams.get("parent") === DOC ? this.inside(DOC) : []
        return { msg: "ok", data: { parent: url.searchParams.get("parent") ?? "", nodes, hidden: 0, count: nodes.length, next_cursor: "" } }
      },
      "/doc/delete": (_url: URL, request: Request) => {
        const { doc_uuid: id, parent_uuid: under } = sent(request) as Record<string, string>
        this.calls.push(`${name} trashes ${TITLES[id]}${under ? ` under ${TITLES[under]}` : ""}`)
        if (under && this.parent.get(id) !== under) return withStatus(409, { code: "not_under", msg: "That page isn't inside this one any more." })
        this.trashed.add(id)
        return { msg: "ok", data: { batch_id: `b-${this.calls.length}`, count: 1 } }
      },
      "/doc/restore": (_url: URL, request: Request) => {
        const { doc_uuid: id, placed } = sent(request) as { doc_uuid: string; placed?: boolean }
        this.calls.push(`${name} restores ${TITLES[id]}${placed ? ", placed" : ""}`)
        this.trashed.delete(id)
        return { msg: "ok", data: { restored: 1, parent_uuid: this.parent.get(id) } }
      },
      "/doc/move/preview": { msg: "ok", data: { available: true, can_adopt: true, lose: 0, gain: 0, pages: 0, summary: "" } },
      "/doc/move": (_url: URL, request: Request) => {
        const { doc_uuid: id, parent_uuid: to } = sent(request) as Record<string, string>
        this.calls.push(`${name} moves ${TITLES[id]} into ${TITLES[to]}`)
        this.parent.set(id, to)
        return { msg: "ok", data: { access: "keep" } }
      },
      "/doc/list": { msg: "ok", data: { scope: "recent", count: 2, docs: [NOTES, ENG].map((id) => ({ doc_uuid: id, doc_title: TITLES[id], path: [] })) } },
      [`/doc/ancestors/${NOTES}`]: { msg: "ok", data: { ancestors: [{ kind: "doc", uuid: DOC, title: TITLES[DOC], has_children: true }], truncated: false } },
      // A page's block warms its page, so every page but the open one answers as the server would.
      ...Object.fromEntries(
        Object.keys(TITLES)
          .filter((id) => id !== DOC)
          .map((id) => [`/doc/getDocInfo/${id}`, docInfo({ doc_uuid: id, doc_title: TITLES[id], edit: true })]),
      ),
    }
  }
}

type Theme = "light" | "dark"

/**
 * The doc, open for each person (the first opens it), all on one relay and
 * one tree, as someone who has seen the keys tip and the demo's prompt:
 * nothing over the doc but what is under test.
 */
async function openDoc(browser: Browser, testInfo: TestInfo, people: Array<[Person, { phone?: boolean; theme?: Theme }?]>) {
  const relay = new CollabRelay()
  const tree = new Tree()
  const tabs: DocTab[] = []
  for (const [person, how = {}] of people) {
    const storage: Record<string, string> = { oc_keys_tip_seen: "1", "onecamp:demo-lead-dismissed": "1", ...(how.theme ? { "ui-theme": how.theme } : {}) }
    const opened: OpenAs = { phone: how.phone, storage, answers: tree.answers(person) }
    tabs.push(await openDocAs(browser, testInfo, relay, person, { id: DOC }, opened))
  }
  return { tree, tabs }
}

/** Links a page into the body with "/link to page", as a person does: its block, drawn as the page reads now. */
async function linkPage(tab: DocTab, title: string) {
  // On its first line's text: an empty doc's starter lies over the body below
  // it, and the body's left edge is the gutter, where the first block's grip
  // shows under a pointer that rests there (and takes the click, as it should).
  // A pointer resting on the grip first doesn't change where the click lands.
  await tab.body.hover({ position: { x: 24, y: 12 } })
  await tab.body.locator("p").first().click()
  // A space ends what "/" was asked: the entry is chosen from what "/link" finds.
  await tab.page.keyboard.type("/link")
  const entry = tab.page.getByRole("option", { name: /^Link to page/ })
  await expect(entry).toBeVisible({ timeout: 15_000 })
  await entry.click()
  await tab.page.getByRole("option", { name: title }).click()
  await expect(pageBlock(tab, title)).toBeVisible({ timeout: 15_000 })
}

const pageBlock = (tab: DocTab, title: string) => tab.body.locator('[data-subpage][data-state="ok"]', { hasText: title })
const pagesInside = (tab: DocTab) => tab.page.getByRole("region", { name: "Pages inside" })
// Exact: the toast's live announcement says more than its title.
const trashedToast = (tab: DocTab) => tab.page.getByText("Moved “Launch notes” to the trash", { exact: true })

/**
 * The selected looks a page's block wears: the block selection's tint (on its
 * node view, or a block around it) and its own ring. A chosen block wears one.
 */
async function selectedLooks(tab: DocTab, title: string) {
  const block = pageBlock(tab, title)
  const tint = await block.locator("xpath=ancestor-or-self::*[contains(concat(' ', normalize-space(@class), ' '), ' block-selected ')]").count()
  const ring = await block.locator("[data-subpage-open].ring-2").count()
  return { tint: tint > 0, ring: ring > 0 }
}

/** Runs a block menu action on a page's block, by its name, as the keyboard does after a click on the grip. */
async function fromBlockMenu(tab: DocTab, title: string, action: string) {
  await hover(tab.page, pageBlock(tab, title))
  await grip(tab.page).click()
  await expect(menu(tab.page)).toBeVisible()
  await tab.page.keyboard.type(action)
  await tab.page.keyboard.press("Enter")
}

test("deleting a child page's block puts the page in the trash; the toast's Undo brings back both, and the other tab asks nothing", async ({ browser }, testInfo) => {
  const { tree, tabs } = await openDoc(browser, testInfo, [[SAM], [PRIYA]])
  const [sam, priya] = tabs
  await linkPage(sam, "Launch notes")
  await expect(pageBlock(priya, "Launch notes")).toBeVisible({ timeout: 15_000 })

  await fromBlockMenu(sam, "Launch notes", "Delete")
  await expect(trashedToast(sam)).toBeVisible({ timeout: 15_000 })
  await expect(sam.body.locator("[data-subpage]")).toHaveCount(0)
  await expect(priya.body.locator("[data-subpage]")).toHaveCount(0, { timeout: 15_000 })
  expect(tree.calls).toEqual(["sam trashes Launch notes under Launch plan"])

  await sam.page.getByRole("button", { name: "Undo" }).click()
  await expect(pageBlock(sam, "Launch notes")).toBeVisible({ timeout: 15_000 })
  await expect(pageBlock(priya, "Launch notes")).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => tree.calls).toEqual(["sam trashes Launch notes under Launch plan", "sam restores Launch notes, placed"])
  await expect(trashedToast(sam)).toBeHidden()
  await sam.close()
  await priya.close()
})

test("⌘Z after deleting a child page's block brings back the block and the page, once", async ({ browser }, testInfo) => {
  const { tree, tabs } = await openDoc(browser, testInfo, [[SAM]])
  const [sam] = tabs
  await linkPage(sam, "Launch notes")
  await fromBlockMenu(sam, "Launch notes", "Delete")
  await expect.poll(() => tree.calls).toEqual(["sam trashes Launch notes under Launch plan"])

  await sam.body.click()
  await sam.page.keyboard.press("ControlOrMeta+z")
  await expect(pageBlock(sam, "Launch notes")).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => tree.calls).toEqual(["sam trashes Launch notes under Launch plan", "sam restores Launch notes, placed"])
  await expect(trashedToast(sam)).toBeHidden()
  await sam.close()
})

for (const theme of SHOT_THEMES) {
  test(`Pages inside offers a page with no block, and Add to page puts it at the end for both people (${theme})`, async ({ browser }, testInfo) => {
    const { tree, tabs } = await openDoc(browser, testInfo, [[SAM, { theme }], [PRIYA, { theme }]])
    const [sam, priya] = tabs
    // Priya links it, so Sam's own history holds nothing before his Add.
    await linkPage(priya, "Launch notes")
    await expect(pageBlock(sam, "Launch notes")).toBeVisible({ timeout: 15_000 })
    const inside = pagesInside(sam)
    await expect(inside.getByRole("link")).toHaveText(["Launch budget"], { timeout: 15_000 })
    await expect(pagesInside(priya).getByRole("link")).toHaveText(["Launch budget"], { timeout: 15_000 })
    await inside.getByRole("link", { name: "Launch budget" }).hover()
    await reviewShot(sam.page, "pages-inside", theme)

    await inside.getByRole("button", { name: "Add to page, “Launch budget”" }).click()
    await expect(sam.body.locator("[data-subpage]").last()).toHaveText("Launch budget", { timeout: 15_000 })
    await expect(priya.body.locator("[data-subpage]").last()).toHaveText("Launch budget", { timeout: 15_000 })
    await expect(inside).toBeHidden()
    await expect(pagesInside(priya)).toBeHidden()

    // ⌘Z right after it takes nothing out: an Add isn't in the editor's
    // history, and a child page's block taken out would trash its page.
    await sam.body.focus()
    await sam.page.keyboard.press("ControlOrMeta+z")
    await expect(sam.body.locator("[data-subpage]")).toHaveText(["Launch notes", "Launch budget"])
    expect(tree.calls).toEqual([])
    await sam.close()
    await priya.close()
  })

  test(`a child page's block wears one selected look while its menu is open (${theme})`, async ({ browser }, testInfo) => {
    const { tabs } = await openDoc(browser, testInfo, [[SAM, { theme }]])
    const [sam] = tabs
    await linkPage(sam, "Launch notes")
    await hover(sam.page, pageBlock(sam, "Launch notes"))
    await grip(sam.page).click()
    await expect(menu(sam.page)).toBeVisible()
    // The grip chooses it as a block: the block selection's tint, no ring inside it.
    await expect.poll(() => selectedLooks(sam, "Launch notes")).toEqual({ tint: true, ring: false })
    await reviewShot(sam.page, "page-held-by-menu", theme)
    // Esc closes the menu and leaves it chosen as a block: still the tint alone.
    await sam.page.keyboard.press("Escape")
    await expect(menu(sam.page)).toBeHidden()
    await expect.poll(() => selectedLooks(sam, "Launch notes")).toEqual({ tint: true, ring: false })
    await reviewShot(sam.page, "page-chosen-with-esc", theme)
    await sam.close()
  })

  test(`the block menu's Move to… on a child page's block moves the page (${theme})`, async ({ browser }, testInfo) => {
    const { tree, tabs } = await openDoc(browser, testInfo, [[SAM, { theme }]])
    const [sam] = tabs
    await linkPage(sam, "Launch notes")
    await hover(sam.page, pageBlock(sam, "Launch notes"))
    await grip(sam.page).click()
    await expect(menu(sam.page)).toBeVisible()
    // One Move to…: the page's, not B1's move of blocks.
    await expect(menu(sam.page).getByText("Move to…", { exact: true })).toHaveCount(1)
    await sam.page.keyboard.type("Move to")
    await sam.page.keyboard.press("Enter")
    const dialog = sam.page.locator('[data-doc-move-dialog="choose"]')
    await expect(dialog.getByText("Move “Launch notes” to…")).toBeVisible({ timeout: 15_000 })
    await expect(dialog.locator("[data-doc-move-target]")).toHaveCount(2)
    // The menu's action holds the one block (a NodeSelection): its own ring, no tint around it.
    await expect.poll(() => selectedLooks(sam, "Launch notes")).toEqual({ tint: false, ring: true })
    await reviewShot(sam.page, "page-move-to", theme)

    await dialog.locator(`[data-doc-move-target="${ENG}"]`).click()
    await expect(sam.page.getByText("Moved to “Engineering”", { exact: true })).toBeVisible({ timeout: 15_000 })
    expect(tree.calls).toEqual(["sam moves Launch notes into Engineering"])
    await sam.close()
  })
}

test.describe("on a phone, 390 px with touch", () => {
  for (const theme of SHOT_THEMES) {
    test(`a long-press's sheet deletes a child page's block, Undo brings both back, and Pages inside takes a finger (${theme})`, async ({ browser }, testInfo) => {
      const { tree, tabs } = await openDoc(browser, testInfo, [[SAM], [PRIYA, { phone: true, theme }]])
      const [sam, phone] = tabs
      await linkPage(sam, "Launch notes")
      const block = pageBlock(phone, "Launch notes")
      await expect(block).toBeVisible({ timeout: 15_000 })

      // Pages inside: each row and its Add take a finger, 44 px.
      const inside = pagesInside(phone)
      await expect(inside.getByRole("link")).toHaveText(["Launch budget"], { timeout: 15_000 })
      for (const target of [inside.getByRole("link", { name: "Launch budget" }), inside.getByRole("button", { name: "Add to page, “Launch budget”" })]) {
        await target.scrollIntoViewIfNeeded()
        const hit = await target.evaluate((el) => {
          const box = el.getBoundingClientRect()
          const before = getComputedStyle(el, "::before")
          const reach = before.content === "none" ? 0 : Math.max(parseFloat(before.height) || 0, 0)
          return Math.max(box.height, reach)
        })
        expect(hit).toBeGreaterThanOrEqual(44)
      }
      await reviewShot(phone.page, "pages-inside", theme)

      const box = (await block.boundingBox())!
      const cdp = await phone.page.context().newCDPSession(phone.page)
      const at = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
      const sheet = phone.page.locator("[data-block-sheet]")
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] })
      await expect(sheet).toBeVisible({ timeout: 15_000 })
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await expect(sheet.getByRole("button", { name: "Move to…" })).toHaveCount(1)
      // The long-press chooses it as a block: the block selection's tint, no ring inside it.
      await expect.poll(() => selectedLooks(phone, "Launch notes")).toEqual({ tint: true, ring: false })
      await reviewShot(phone.page, "page-block-sheet", theme)
      await sheet.getByRole("button", { name: "Delete" }).tap()

      await expect(trashedToast(phone)).toBeVisible({ timeout: 15_000 })
      await expect.poll(() => tree.calls).toEqual(["priya trashes Launch notes under Launch plan"])
      await expect(sam.body.locator("[data-subpage]")).toHaveCount(0, { timeout: 15_000 })
      await reviewShot(phone.page, "page-trashed-toast", theme)
      await phone.page.getByRole("button", { name: "Undo" }).tap()
      await expect(pageBlock(phone, "Launch notes")).toBeVisible({ timeout: 15_000 })
      // Restored, it wears at most one selected look.
      await expect.poll(async () => Object.values(await selectedLooks(phone, "Launch notes")).filter(Boolean).length).toBeLessThanOrEqual(1)
      await reviewShot(phone.page, "page-restored", theme)
      await expect(pageBlock(sam, "Launch notes")).toBeVisible({ timeout: 15_000 })
      await expect.poll(() => tree.calls).toEqual(["priya trashes Launch notes under Launch plan", "priya restores Launch notes, placed"])
      await sam.close()
      await phone.close()
    })
  }
})
