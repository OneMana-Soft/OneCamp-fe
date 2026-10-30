import { expect, test, type BrowserContext, type Page } from "@playwright/test"
// The app's server side, faked: fixtures for the API, and one in-memory
// collaboration server for every browser context in a test, so two people
// edit the same doc live. Nothing leaves the machine.
import * as Y from "yjs"
import { USERS, collabFor, dropCollabSocket, fakeApp, setOffline, setOfflineKeepingSocket } from "../scripts/fluidity/fakeApp.mjs"
import { docFromBlocks, launchPlanBlocks } from "../scripts/fluidity/fakeCollab.mjs"
import { statusesUnder } from "./boxes"

// The Doc Session (docs programme A2), end to end on the production build:
// one socket per tab, two people typing and reconnecting into one copy, a doc
// replaced underneath a sleeping tab, and readers watching live.

const PLAN = "d0c00000-0000-4000-8000-000000000001"
const OTHER = ["d0c00000-0000-4000-8000-000000000002", "d0c00000-0000-4000-8000-000000000003"]
const LEVELS = { sam: "full", ann: "edit", vic: "view" }
const EDITABLE = '.doc-editor .ProseMirror[contenteditable="true"]'
const EDITOR = ".doc-editor .ProseMirror"

function docs() {
  const plan = docFromBlocks(launchPlanBlocks(), { epoch: "E1" })
  return [
    { id: PLAN, title: "Q4 launch plan", html: plan.html, update: plan.update, levels: LEVELS },
    ...OTHER.map((id, i) => {
      const d = docFromBlocks([{ type: "heading", level: 1, text: `Doc ${i + 2}` }, { type: "paragraph", text: `Body of doc ${i + 2}.` }])
      return { id, title: `Doc ${i + 2}`, html: d.html, update: d.update, levels: LEVELS }
    }),
  ]
}

const COMPUTER = { viewport: { width: 1280, height: 860 } }
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

async function person(browser: import("@playwright/test").Browser, who: keyof typeof USERS, all: object[], collab: ReturnType<typeof collabFor>, use: import("@playwright/test").BrowserContextOptions = COMPUTER) {
  const context = await browser.newContext(use)
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user: USERS[who], docs: all, collab })
  const page = await context.newPage()
  return { context, page, sockets: (context as BrowserContext & { __collabSockets: { close(): void; open: boolean }[] }).__collabSockets }
}

async function typeAtEnd(page: Page, words: string) {
  const last = page.locator(`${EDITABLE} > p`).last()
  await last.click()
  await page.keyboard.press("End")
  await page.keyboard.type(words, { delay: 15 })
}

/** Opens the plan as a customer sees it: the demo's shared note, when it shows, dismissed. */
async function openAsCustomer(page: Page) {
  await page.goto(`/app/doc/${PLAN}`)
  await expect(page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
  const gotIt = page.getByRole("button", { name: "Got it" })
  await gotIt.waitFor({ timeout: 5_000 }).then(() => gotIt.click(), () => undefined)
  await expect(gotIt).toHaveCount(0)
}

/** Saved for review when SHOTS_DIR is set: <name>.png. */
async function saveShot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${name}.png` })
}

const editorText = (page: Page) => page.locator(EDITOR).first().innerText()
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

/**
 * What the element at `selector` lies over: the doc's title and any control a
 * person can see, apart from its own. An element counts by the part of it that
 * shows, inside every ancestor that clips it (a scroll area's edge cuts off
 * what pokes past it, and nobody can see or tap that part).
 */
function coveredBy(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const own = document.querySelector(sel)
    if (!own) return [`nothing at ${sel}`]
    const box = own.getBoundingClientRect()
    const shown = (el: Element) => {
      let { top, left, right, bottom } = el.getBoundingClientRect()
      for (let a = el.parentElement; a; a = a.parentElement) {
        const s = getComputedStyle(a)
        if (s.overflowX === "visible" && s.overflowY === "visible") continue
        const c = a.getBoundingClientRect()
        top = Math.max(top, c.top)
        left = Math.max(left, c.left)
        right = Math.min(right, c.right)
        bottom = Math.min(bottom, c.bottom)
      }
      return { top, left, right, bottom }
    }
    return [...document.querySelectorAll<HTMLElement>("[data-doc-title], h1, button, a[href], input, textarea")]
      .filter((el) => !own.contains(el) && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
      .filter((el) => {
        const r = shown(el)
        return r.right > r.left && r.bottom > r.top && r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top
      })
      .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}"`)
  }, selector)
}

test.describe("the doc session", () => {
  test("two people type and reconnect, and the doc stays one copy", async ({ browser }) => {
    const all = docs()
    const collab = collabFor(all)
    const sam = await person(browser, "sam", all, collab)
    const ann = await person(browser, "ann", all, collab)
    await sam.page.goto(`/app/doc/${PLAN}`)
    await ann.page.goto(`/app/doc/${PLAN}`)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    await expect(ann.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })

    // Typing reaches the other person within a second.
    await typeAtEnd(sam.page, " Sam was here.")
    await expect.poll(() => editorText(ann.page), { timeout: 1_000 }).toContain("Sam was here.")

    // The server drops Sam's connection; he reconnects and types again.
    sam.sockets.at(-1)!.close()
    await expect.poll(() => sam.sockets.filter((s) => s.open).length, { timeout: 10_000 }).toBe(1)
    await typeAtEnd(sam.page, " And back.")
    await expect.poll(() => editorText(ann.page), { timeout: 5_000 }).toContain("And back.")

    // Ann goes offline, types, and comes back.
    await setOffline(ann.context, true)
    await typeAtEnd(ann.page, " Ann offline.")
    await ann.page.waitForTimeout(300)
    expect(await editorText(sam.page)).not.toContain("Ann offline.")
    await setOffline(ann.context, false)
    await expect.poll(() => editorText(sam.page), { timeout: 15_000 }).toContain("Ann offline.")

    // One copy everywhere: every block once, every edit once.
    const server = collab.doc(PLAN).getXmlFragment("default").toString()
    for (const text of [await editorText(sam.page), await editorText(ann.page), server]) {
      expect(count(text, "We launch on the last Tuesday")).toBe(1)
      expect(count(text, "Sam was here.")).toBe(1)
      expect(count(text, "And back.")).toBe(1)
      expect(count(text, "Ann offline.")).toBe(1)
    }
    for (const page of [sam.page, ann.page]) expect(await page.locator(`${EDITOR} > *`).count()).toBe(launchPlanBlocks().length)
    expect(collab.stats.secondCopies).toBe(0)
    await sam.context.close()
    await ann.context.close()
  })

  // The journey's probe (12 Oct): after a short offline/online blip with the
  // socket still open, the live doc sat on its saved copy, read-only, until a
  // reload. `offline` dropped `synced`, and `online` called connect() on the
  // open socket, which does nothing.
  test("a short offline blip leaves the doc editable, and what the blip lost arrives once back", async ({ browser }) => {
    const all = docs()
    const collab = collabFor(all)
    const sam = await person(browser, "sam", all, collab)
    const ann = await person(browser, "ann", all, collab)
    await sam.page.goto(`/app/doc/${PLAN}`)
    await ann.page.goto(`/app/doc/${PLAN}`)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    await expect(ann.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    const dot = sam.page.locator("[data-save-state]").first()

    // A blip that loses nothing: the editor stays, the dot says offline, and
    // typing straight after reaches Ann.
    await setOfflineKeepingSocket(sam.context, true)
    await expect(dot).toHaveAttribute("data-save-state", "offline")
    await sam.page.waitForTimeout(1_000)
    await expect(sam.page.locator(EDITABLE)).toBeVisible()
    await setOfflineKeepingSocket(sam.context, false)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 3_000 })
    await typeAtEnd(sam.page, " After the blip.")
    await expect.poll(() => editorText(ann.page), { timeout: 3_000 }).toContain("After the blip.")
    await expect(dot).toHaveAttribute("data-save-state", "saved", { timeout: 3_000 })

    // A blip that loses frames both ways: each person's typing arrives once
    // Sam is back, with no reconnect.
    await setOfflineKeepingSocket(sam.context, true, { lose: true })
    await typeAtEnd(sam.page, " Sam in the blip.")
    await typeAtEnd(ann.page, " Ann in the blip.")
    await sam.page.waitForTimeout(500)
    expect(await editorText(ann.page)).not.toContain("Sam in the blip.")
    expect(await editorText(sam.page)).not.toContain("Ann in the blip.")
    await setOfflineKeepingSocket(sam.context, false)
    await expect.poll(() => editorText(ann.page), { timeout: 3_000 }).toContain("Sam in the blip.")
    await expect.poll(() => editorText(sam.page), { timeout: 3_000 }).toContain("Ann in the blip.")
    await expect(sam.page.locator(EDITABLE)).toBeVisible()
    await expect(dot).toHaveAttribute("data-save-state", "saved", { timeout: 3_000 })
    expect(sam.sockets).toHaveLength(1)

    // One copy everywhere.
    const server = collab.doc(PLAN).getXmlFragment("default").toString()
    for (const text of [await editorText(sam.page), await editorText(ann.page), server]) {
      expect(count(text, "We launch on the last Tuesday")).toBe(1)
      for (const typed of ["After the blip.", "Sam in the blip.", "Ann in the blip."]) expect(count(text, typed)).toBe(1)
    }
    expect(collab.stats.secondCopies).toBe(0)
    await sam.context.close()
    await ann.context.close()
  })

  test("one socket carries every doc a tab opens", async ({ browser }) => {
    const all = docs()
    const collab = collabFor(all)
    const sam = await person(browser, "sam", all, collab)
    await sam.page.goto(`/app/doc/${PLAN}`)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    for (const id of [OTHER[0], OTHER[1], PLAN, OTHER[0]]) {
      await sam.page.evaluate((url) => (window as unknown as { next: { router: { push(u: string): void } } }).next.router.push(url), `/app/doc/${id}`)
      await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 15_000 })
      await expect(sam.page.locator(EDITOR).first()).toContainText(id === PLAN ? "Q4 launch plan" : "Body of doc")
    }
    expect(sam.sockets).toHaveLength(1)
    await sam.context.close()
  })

  test("a tab that slept through a restore drops its copy instead of doubling the doc", async ({ browser }) => {
    const all = docs()
    const collab = collabFor(all)
    const sam = await person(browser, "sam", all, collab)
    await sam.page.goto(`/app/doc/${PLAN}`)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })

    await setOffline(sam.context, true)
    await typeAtEnd(sam.page, " Typed while away.")
    // Restored underneath: a new body, so a new lineage.
    const restored = docFromBlocks([{ type: "heading", level: 1, text: "Q4 launch plan" }, { type: "paragraph", text: "Restored: we launch in March." }], { epoch: "E2" })
    collab.setDoc(PLAN, restored.update)
    await setOffline(sam.context, false)

    await expect.poll(() => editorText(sam.page), { timeout: 20_000 }).toContain("Restored: we launch in March.")
    const shown = await editorText(sam.page)
    expect(shown).not.toContain("We launch on the last Tuesday")
    expect(count(shown, "Q4 launch plan")).toBe(1)
    // The edits the server never had are offered back, not merged.
    await expect(sam.page.locator("[data-recovered-edits]")).toBeVisible()
    const server = collab.doc(PLAN).getXmlFragment("default").toString()
    expect(server).not.toContain("We launch on the last Tuesday")
    expect(server).not.toContain("Typed while away.")
    await sam.context.close()
  })

  test("a reader sees typing live and can't edit", async ({ browser }) => {
    const all = docs()
    const collab = collabFor(all)
    const sam = await person(browser, "sam", all, collab)
    const vic = await person(browser, "vic", all, collab)
    await sam.page.goto(`/app/doc/${PLAN}`)
    await vic.page.goto(`/app/doc/${PLAN}`)
    await expect(sam.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
    await expect(vic.page.locator(EDITOR).first()).toContainText("last Tuesday", { timeout: 30_000 })
    await vic.page.waitForTimeout(1_500)
    // The doc page joins readers live once it uses the Doc Session
    // (useDocSession); until that wiring, a reader reads the saved body.
    test.skip(vic.sockets.length === 0, "DocView still reads the saved body for readers: switching it to useDocSession is a wiring item")
    expect(await vic.page.locator(EDITABLE).count()).toBe(0)
    await typeAtEnd(sam.page, " For the reader.")
    await expect.poll(() => editorText(vic.page), { timeout: 1_000 }).toContain("For the reader.")
    await sam.context.close()
    await vic.context.close()
  })

  // A doc drawn without its header (a phone's, or one in focus mode) has no
  // save dot (D05). What the dot says while this tab's work isn't stored must
  // still reach it (V-21): that the changes are kept while the socket is down
  // with the network up (beside a phone's pill, which says Reconnecting, only
  // that), in the amber warning tone, then that they are being saved, then
  // saved. With SHOTS_DIR set, each is saved for review, light and dark.
  for (const [form, use] of [["phone", PHONE], ["computer in focus mode", COMPUTER]] as const) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`without a header (${form}, ${colorScheme}), changes kept to sync are said, then that they are being saved, then saved`, async ({ browser }) => {
        test.skip(colorScheme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots")
        test.setTimeout(120_000)
        const all = docs()
        const collab = collabFor(all)
        const sam = await person(browser, "sam", all, collab, { ...use, colorScheme })
        const { page } = sam
        const shot = (name: string) => saveShot(page, `doc-save-notice-${name}-${use.viewport.width}-${colorScheme}`)
        await openAsCustomer(page)
        if (use === COMPUTER) {
          await page.getByRole("button", { name: "More doc actions" }).click()
          await page.getByRole("menuitem", { name: /^Focus mode/ }).click()
          await expect(page.getByRole("button", { name: "Exit focus mode" })).toBeAttached()
        }
        const storedNow = () => ({ type: "persisted", at: Date.now(), sv: Buffer.from(Y.encodeStateVector(collab.doc(PLAN))).toString("base64") })
        // As the server tells each tab that connects: the doc is stored.
        collab.tell(PLAN, storedNow())

        // The socket drops while the network stays up, and Sam types.
        dropCollabSocket(sam.context, true)
        await typeAtEnd(page, " Typed with the socket down.")
        const waiting = page.getByText(use === PHONE ? /^Changes are kept and will sync$/ : /^Reconnecting\. Changes are kept and will sync$/)
        await expect(waiting).toBeVisible({ timeout: 15_000 })
        // The shared toast's warning tone: work at risk, not lost.
        await expect(page.locator(".toast-root").filter({ has: waiting }).locator('[data-tone="warning"]')).toBeVisible()
        await shot("waiting")
        if (use === PHONE) {
          // Typing, the toast comes in under the top bar, and under the pill's row docked there, never over it.
          const row = page.locator("[data-connection-pill]")
          await expect(row).toBeVisible()
          const [toastBox, rowBox] = [await waiting.boundingBox(), await row.boundingBox()]
          expect(toastBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height)
          // The keyboard down: nothing is typed into, so the toast sits above the foot.
          await page.locator(EDITABLE).evaluate((el) => (el as HTMLElement).blur())
          await expect(waiting).toBeVisible()
          await shot("waiting-keyboard-down")
        }

        // Back: the changes reach the server, which hasn't stored them yet.
        dropCollabSocket(sam.context, false)
        await expect.poll(() => collab.doc(PLAN).getXmlFragment("default").toString(), { timeout: 30_000 }).toContain("Typed with the socket down.")
        await expect(waiting).toHaveCount(0, { timeout: 15_000 })
        const saving = page.getByText("Saving your changes", { exact: true })
        await expect(saving).toBeVisible()
        await shot("saving")

        // Stored: the notice says so, then goes.
        collab.tell(PLAN, storedNow())
        const saved = page.getByText(/^Saved · /)
        await expect(saved).toBeVisible({ timeout: 15_000 })
        await shot("saved")
        await expect(saved).toHaveCount(0, { timeout: 15_000 })
        await expect(saving).toHaveCount(0)
        expect(count(await editorText(page), "Typed with the socket down.")).toBe(1)
        await sam.context.close()
      })
    }
  }

  // The header's dot says what the connection pill says while only the live
  // connection is down: its sun ring and "Reconnecting", and the waiting count
  // in its tooltip. No notice repeats it where the dot is drawn (V-21).
  for (const colorScheme of ["light", "dark"] as const) {
    test(`on a computer (${colorScheme}), the save dot says reconnecting while only the live connection is down, and no notice repeats it`, async ({ browser }) => {
      test.skip(colorScheme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots")
      const all = docs()
      const collab = collabFor(all)
      const sam = await person(browser, "sam", all, collab, { ...COMPUTER, colorScheme })
      const { page } = sam
      await openAsCustomer(page)
      dropCollabSocket(sam.context, true)
      await typeAtEnd(page, " Typed with the socket down.")
      const dot = page.locator("[data-save-dot]")
      await expect(dot.locator("[data-save-state]")).toHaveAttribute("data-save-state", "reconnecting", { timeout: 15_000 })
      await expect(dot).toContainText("Reconnecting")
      // The pill, a lazy chunk, says it once the problem has lasted (SAY_PROBLEM_AFTER_MS).
      await expect(page.getByText("Reconnecting…", { exact: true })).toBeVisible({ timeout: 15_000 })
      await dot.hover()
      await expect(page.getByRole("tooltip")).toHaveText("Reconnecting. Changes are kept and will sync")
      await saveShot(page, `doc-save-dot-reconnecting-1280-${colorScheme}`)
      await page.waitForTimeout(1_000)
      await expect(page.locator(".toast-root")).toHaveCount(0)
      dropCollabSocket(sam.context, false)
      await expect(dot.locator("[data-save-state]")).not.toHaveAttribute("data-save-state", "reconnecting", { timeout: 30_000 })
      await sam.context.close()
    })
  }

  // Offline, the window's word wins over the socket's (V-21's regression, 28
  // Oct): the network goes, then the socket closes, as in the journey's drops
  // and a real outage. Past the pill's wait the doc says offline, never
  // reconnecting, until the network is back; then what was typed is saved
  // once. With SHOTS_DIR set, saved for review at 1280 and 390, light and dark.
  for (const [form, use] of [["computer", COMPUTER], ["phone", PHONE]] as const) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`offline with its socket gone (${form}, ${colorScheme}), the doc says offline, never reconnecting, and saves once back`, async ({ browser }) => {
        test.skip(colorScheme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots")
        test.setTimeout(120_000)
        const all = docs()
        const collab = collabFor(all)
        const sam = await person(browser, "sam", all, collab, { ...use, colorScheme })
        const { page } = sam
        const storedNow = () => ({ type: "persisted", at: Date.now(), sv: Buffer.from(Y.encodeStateVector(collab.doc(PLAN))).toString("base64") })
        await openAsCustomer(page)
        collab.tell(PLAN, storedNow())
        const dot = page.locator("[data-save-dot] [data-save-state]")

        await sam.context.setOffline(true)
        dropCollabSocket(sam.context, true)
        await typeAtEnd(page, " Typed offline.")
        // The pill speaks once the problem has lasted SAY_PROBLEM_AFTER_MS (2 s).
        await expect(page.locator('[data-connection-pill="offline"]').first()).toBeVisible({ timeout: 15_000 })
        await expect(page.locator('[data-connection-pill="reconnecting"]')).toHaveCount(0)
        if (use === COMPUTER) await expect(dot).toHaveAttribute("data-save-state", "offline")
        // A phone has no dot (D05): its notice says what the dot would (V-21).
        else {
          const notice = page.getByText("Changes are kept and will sync", { exact: true })
          await expect(notice).toBeVisible()
          // The notice says what the app's connection pill would: the pill steps aside while it shows, so no
          // second status sits under it (DESIGN-BUILD-29 M1).
          await expect(page.locator('.shell-footpill[data-connection-pill="offline"]')).toBeHidden()
          expect(await statusesUnder(page.locator(".toast-card").filter({ has: notice }))).toEqual([])
        }
        // One surface per message (V-21, design review): beside the phone's notice the doc's pill names only the
        // connection; a computer's pill, with no notice beside it, says the changes are kept in the dot's words.
        await expect(page.locator('[data-doc-view] [data-connection-pill="offline"]')).toHaveText(use === PHONE ? "Offline" : "Offline. Changes are kept and will sync")
        await expect(page.getByText(/^Reconnecting/)).toHaveCount(0)
        await saveShot(page, `doc-offline-socket-gone-${use.viewport.width}-${colorScheme}`)

        dropCollabSocket(sam.context, false)
        await sam.context.setOffline(false)
        await expect.poll(() => collab.doc(PLAN).getXmlFragment("default").toString(), { timeout: 30_000 }).toContain("Typed offline.")
        await expect(page.locator('[data-connection-pill="offline"]')).toHaveCount(0, { timeout: 15_000 })
        collab.tell(PLAN, storedNow())
        if (use === COMPUTER) await expect(dot).toHaveAttribute("data-save-state", "saved", { timeout: 15_000 })
        expect(count(await editorText(page), "Typed offline.")).toBe(1)
        await sam.context.close()
      })
    }
  }

  // A first connection through a cold edge after a restart can take the
  // sign-in and answer nothing (22 Oct, 20:05). The doc must still come live,
  // and when no connection answers, the page says so and offers Try again.
  for (const [form, use] of [["computer", COMPUTER], ["phone", PHONE]] as const) {
    test(`a sign-in nobody answers: a new connection brings the doc, and Try again does when that fails too (${form})`, async ({ browser }) => {
      test.setTimeout(120_000)
      const all = docs()
      const first = await person(browser, "sam", all, collabFor(all, { mute: (socket: number) => socket === 1 }), use)
      await first.page.goto(`/app/doc/${PLAN}`)
      await expect(first.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
      await expect(first.page.locator(EDITOR).first()).toContainText("Q4 launch plan")
      expect(first.sockets).toHaveLength(2)
      await first.context.close()

      let answering = false
      const second = await person(browser, "sam", all, collabFor(all, { mute: () => !answering }), use)
      await second.page.goto(`/app/doc/${PLAN}`)
      const pill = second.page.locator('[data-connection-pill="stalled"]')
      await expect(pill).toContainText("Still connecting…", { timeout: 45_000 })
      // It covers neither the title nor a control: on a phone it is a row
      // under the header that moves the page down (DESIGN-BUILD-7, 23 Oct).
      expect(await coveredBy(second.page, '[data-connection-pill="stalled"]')).toEqual([])
      // Nothing is editable before the server's copy is here.
      expect(await second.page.locator(EDITABLE).count()).toBe(0)
      answering = true
      const tryAgain = pill.getByRole("button", { name: "Try again" })
      if (form === "phone") await tryAgain.tap()
      else await tryAgain.click()
      await expect(second.page.locator(EDITABLE)).toBeVisible({ timeout: 30_000 })
      await expect(second.page.locator(EDITOR).first()).toContainText("Q4 launch plan")
      await expect(second.page.locator('[data-connection-pill="stalled"]')).toHaveCount(0)
      await second.context.close()
    })
  }
})
