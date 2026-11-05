import { expect, test, type Browser, type BrowserContextOptions, type Page } from "@playwright/test"
import * as Y from "yjs"
import { USERS, collabFor, fakeApp } from "../scripts/fluidity/fakeApp.mjs"
import { displayNameOf } from "../lib/personName"
import { NOTE_COLOURS } from "../lib/board/notes"
import { SHOT_THEMES, reviewShot } from "./stubbedApp"
import { boardDoc, boardDocName, boardFixtures, note, ordered } from "../scripts/fluidity/fakeBoard.mjs"

// Private mode on a board (miro-25): any editor starts a round from the facilitation bar; while it runs, a note
// someone makes or edits stays in their own tab. The collaboration server (and so every other screen, the AI and any
// export of the shared board) holds the note with no words, locked and named as its author's, until the round ends.
// Then the author's tab reveals it and everyone has the words. A reload in the middle keeps the author's words.

const BOARD = "b0a4d000-0000-4000-8000-0000000000d5"
const NAME = boardDocName(BOARD)
const LEVELS = { sam: "edit", ann: "edit" }
const SECRET = "Move the offsite to Goa"

const DEVICES = {
  computer: { viewport: { width: 1280, height: 860 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

type Shared = { id: string; type: string; text?: string; isDeleted?: boolean; locked?: boolean; containerId?: string | null; customData?: Record<string, unknown> }

function shareBoard() {
  const notes = [...note("venue", 40, 120, "Book the venue"), ...note("recap", 240, 120, "Send the recap")]
  const board = { uuid: BOARD, title: "Offsite ideas", levels: LEVELS, update: boardDoc(ordered(notes)) }
  return { board, collab: collabFor([{ id: NAME, update: board.update, levels: LEVELS }]) }
}

type Extra = { colorScheme?: "light" | "dark"; fixtures?: Array<[RegExp, unknown]>; noStorage?: boolean; zoom?: number }

async function open(browser: Browser, device: keyof typeof DEVICES, on: ReturnType<typeof shareBoard>, user = USERS.sam, extra: Extra = {}) {
  const { board, collab } = on
  const context = await browser.newContext({ ...DEVICES[device], colorScheme: extra.colorScheme ?? "light" })
  // A browser that can't keep the round's words (a private window, a full disk): every write of them throws.
  if (extra.noStorage)
    await context.addInitScript(() => {
      const set = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key.startsWith("board-private:")) throw new DOMException("full", "QuotaExceededError")
        return set.call(this, key, value)
      }
    })
  await context.addInitScript(
    ([key, zoom]: [string, number]) => {
      try {
        localStorage.setItem("oc_keys_tip_seen", "1")
        localStorage.setItem(key, JSON.stringify({ scrollX: 0, scrollY: 0, zoom }))
      } catch {
        /* the notes are then elsewhere, and the test says so */
      }
    },
    [`onecamp:board:viewport:${BOARD}`, extra.zoom ?? 1] as [string, number],
  )
  await fakeApp(context, { app: String(test.info().project.use.baseURL), user, docs: [], collab, fixtures: [...(extra.fixtures ?? []), ...boardFixtures([board], user, USERS.sam)] })
  const page = await context.newPage()
  await page.goto(`/app/board/${BOARD}`)
  await synced(page)
  return { context, page }
}

const synced = (page: Page) => expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })

/** What the collaboration server holds: every live element, and its document's bytes, the words searched for in them. */
function server(collab: ReturnType<typeof shareBoard>["collab"]) {
  const doc = () => collab.doc(NAME)
  const elements = () => (Array.from(doc().getMap("elements").values()) as Shared[]).filter((e) => !e.isDeleted)
  const has = (words: string) => Buffer.from(Y.encodeStateAsUpdate(doc())).includes(Buffer.from(words))
  const round = () => doc().getMap("facilitation").get("private") as { byName?: string } | undefined
  return { elements, has, round }
}

/** A note made on `page`'s computer screen: N, a press on the board, and words. */
async function addNote(page: Page, words: string) {
  const canvas = (await page.locator(".excalidraw").first().boundingBox())!
  await page.locator(".excalidraw").first().focus()
  await page.keyboard.press("n")
  await expect(page.locator("[data-note-ghost]")).toBeAttached()
  await page.mouse.click(canvas.x + 760, canvas.y + 520)
  await expect(page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
  await page.keyboard.type(words, { delay: 10 })
  await page.keyboard.press("Escape")
}

test("on a computer, a note made in private mode reaches no other screen or the server until the round ends, a reload keeps it, and the end shows it to everyone", async ({ browser }) => {
  const on = shareBoard()
  const s = server(on.collab)
  const sam = await open(browser, "computer", on)
  const ann = await open(browser, "computer", on, USERS.ann)

  // Sam starts a round; both bars say so, and Ann's names who started it.
  await sam.page.getByRole("button", { name: "Private mode", exact: true }).click()
  await expect.poll(() => s.round()?.byName).toBe(displayNameOf(USERS.sam))
  await expect(sam.page.getByRole("toolbar", { name: "Facilitation" })).toContainText("Private mode · started by you")
  await expect(ann.page.getByRole("toolbar", { name: "Facilitation" })).toContainText(`Private mode · started by ${displayNameOf(USERS.sam)}`)

  // Sam's new note reaches the server veiled: no words, locked, his.
  await addNote(sam.page, SECRET)
  const held = () => s.elements().find((e) => e.type === "text" && e.customData?.privateBy === USERS.sam.user_uuid)
  await expect.poll(() => held()?.locked, { timeout: 10_000 }).toBe(true)
  expect(held()?.text).toBe("")
  expect(s.has(SECRET)).toBe(false)
  // Ann's screen says whose the note is; Sam's own has no veil.
  await expect(ann.page.locator("[data-private-veils] [role=note]")).toHaveAttribute("aria-label", `Private · ${displayNameOf(USERS.sam)}`)
  await expect(sam.page.locator("[data-private-veils] [role=note]")).toHaveCount(0)
  // V-488: Sam's other device has his note from the board, without the words: it says it's his and waiting.
  const samElsewhere = await open(browser, "computer", on)
  await expect(samElsewhere.page.locator("[data-private-veils] [role=note]")).toHaveAttribute("aria-label", "Private · you, in another tab or device")
  await expect(samElsewhere.page.locator("[data-private-veils] [role=note]")).toBeVisible()

  // A reload keeps his words in his tab (this browser only), and still sends none.
  const kept = () => sam.page.evaluate((key) => localStorage.getItem(key) ?? "", `board-private:${BOARD}:${USERS.sam.user_uuid}`)
  await expect.poll(kept, { timeout: 5_000 }).toContain(SECRET)
  await sam.page.reload()
  await synced(sam.page)
  await sam.page.waitForTimeout(1_000)
  expect(s.has(SECRET)).toBe(false)

  // Ann ends the round: Sam's tab reveals his note, words and all, to the server and so to Ann.
  await ann.page.getByRole("toolbar", { name: "Facilitation" }).getByRole("button", { name: "End", exact: true }).click()
  await expect.poll(() => s.has(SECRET), { timeout: 10_000 }).toBe(true)
  const shown = s.elements().find((e) => e.type === "text" && e.text === SECRET)
  expect(shown?.locked).toBeFalsy()
  expect(shown?.customData?.privateBy).toBeUndefined()
  // The round's state leaves the bar, and its start button is back.
  await expect(ann.page.getByRole("toolbar", { name: "Facilitation" })).not.toContainText("started by")
  await expect(ann.page.getByRole("toolbar", { name: "Facilitation" }).getByRole("button", { name: "Private mode", exact: true })).toBeVisible()
  await expect(ann.page.locator("[data-private-veils] [role=note]")).toHaveCount(0)
  await expect(samElsewhere.page.locator("[data-private-veils] [role=note]")).toHaveCount(0)
  await expect.poll(kept).toBe("")
  await samElsewhere.context.close()
  await sam.context.close()
  await ann.context.close()
})

// V-497: the author's tab shut in the round, the round ended on another screen, and the tab opened again in the same
// browser. The reopened tab read the canvas before the board's document was on it, found nothing to show and wiped
// the words it kept: the note stayed locked and empty for everyone. Now it shows them.
for (const device of ["computer", "phone"] as const)
  test(`on a ${device}, the author's tab shut in a round that then ends elsewhere shows the note's words when it opens again`, async ({ browser }) => {
    test.setTimeout(120_000)
    const on = shareBoard()
    const s = server(on.collab)
    const sam = await open(browser, device, on)
    const ann = await open(browser, "computer", on, USERS.ann)
    await ann.page.getByRole("button", { name: "Private mode", exact: true }).click()
    await expect.poll(() => s.round()?.byName).toBe(displayNameOf(USERS.ann))

    // Sam writes a note in the round: the server has it veiled, and only his browser has the words.
    if (device === "phone") {
      await sam.page.getByRole("toolbar", { name: "Board tools" }).getByRole("button", { name: "Add a note" }).tap()
      await expect(sam.page.locator("textarea.excalidraw-wysiwyg")).toBeVisible({ timeout: 5_000 })
      await sam.page.keyboard.type(SECRET, { delay: 10 })
      await sam.page.keyboard.press("Escape")
    } else await addNote(sam.page, SECRET)
    const held = () => s.elements().find((e) => e.type === "text" && e.customData?.privateBy === USERS.sam.user_uuid)
    await expect.poll(() => held()?.locked, { timeout: 10_000 }).toBe(true)
    const key = `board-private:${BOARD}:${USERS.sam.user_uuid}`
    const kept = (page: Page) => page.evaluate((k) => localStorage.getItem(k) ?? "", key)
    await expect.poll(() => kept(sam.page), { timeout: 5_000 }).toContain(SECRET)
    expect(s.has(SECRET)).toBe(false)

    // He shuts the tab; Ann ends the round. Her screen says the note shows when he opens the board.
    await sam.page.close()
    await ann.page.getByRole("toolbar", { name: "Facilitation" }).getByRole("button", { name: "End", exact: true }).click()
    await expect.poll(() => s.round()).toBeUndefined()
    await expect(ann.page.locator("[data-private-veils] [role=note]")).toHaveAttribute("aria-label", `Shows when ${displayNameOf(USERS.sam)} opens the board`)

    // He opens the board again in the same browser: the words reach the server and Ann, open and unlocked.
    const again = await sam.context.newPage()
    await again.goto(`/app/board/${BOARD}`)
    await synced(again)
    await expect.poll(() => s.has(SECRET), { timeout: 10_000 }).toBe(true)
    const shown = s.elements().find((e) => e.type === "text" && e.text === SECRET)
    expect(shown?.locked).toBeFalsy()
    expect(shown?.customData?.privateBy).toBeUndefined()
    await expect(ann.page.locator("[data-private-veils] [role=note]")).toHaveCount(0)
    await expect.poll(() => kept(again)).toBe("")
    await sam.context.close()
    await ann.context.close()
  })

test("on a phone, an editor starts private mode from the bar and ends it from its menu, and a teammate's note stays theirs till then", async ({ browser }) => {
  const on = shareBoard()
  const s = server(on.collab)
  const sam = await open(browser, "phone", on)
  const ann = await open(browser, "computer", on, USERS.ann)

  await sam.page.getByRole("button", { name: "Start private mode" }).tap()
  await expect.poll(() => s.round()?.byName).toBe(displayNameOf(USERS.sam))
  const bar = sam.page.getByRole("toolbar", { name: "Facilitation" })
  await expect(bar).toContainText("Private")
  // The compact bar stays whole at 390: nothing scrolls out of it.
  expect(await bar.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)

  // Ann writes a note on her computer: the server has it without its words.
  await addNote(ann.page, SECRET)
  await expect.poll(() => s.elements().some((e) => e.type === "text" && e.customData?.privateBy === USERS.ann.user_uuid), { timeout: 10_000 }).toBe(true)
  expect(s.has(SECRET)).toBe(false)
  // V-488: Ann's phone, her other device, shows her note as hers and waiting (zoomed out, so the note her computer
  // put at its middle is on the phone's screen; a veil is drawn only for a note in view).
  const annPhone = await open(browser, "phone", on, USERS.ann, { zoom: 0.4 })
  await expect(annPhone.page.locator("[data-private-veils] [role=note]")).toHaveAttribute("aria-label", "Private · you, in another tab or device")
  await expect(annPhone.page.locator("[data-private-veils] [role=note]")).toBeVisible()

  // Sam ends the round from the bar's menu; Ann's tab reveals her note.
  await bar.getByRole("button", { name: "Facilitation options" }).tap()
  await sam.page.getByRole("menuitem", { name: "End private mode" }).tap()
  await expect.poll(() => s.round()).toBeUndefined()
  await expect.poll(() => s.has(SECRET), { timeout: 10_000 }).toBe(true)
  await expect(annPhone.page.locator("[data-private-veils] [role=note]")).toHaveCount(0)
  await annPhone.context.close()
  await sam.context.close()
  await ann.context.close()
})

const PROJECTS: Array<[RegExp, unknown]> = [[/\/project\/projectListByAdminUID$/, { msg: "ok", data: [{ project_uuid: "p0a4d000-0000-4000-8000-0000000000d5", project_name: "Offsite" }] }]]

for (const theme of SHOT_THEMES)
  test(`on a computer (${theme}), a teammate's held note is the note face down, its author's Make tasks leaves it out, and a browser that can't keep the words says so`, async ({ browser }) => {
    test.setTimeout(120_000)
    const on = shareBoard()
    const s = server(on.collab)
    const sam = await open(browser, "computer", on, USERS.sam, { colorScheme: theme, noStorage: true, fixtures: PROJECTS })
    const ann = await open(browser, "computer", on, USERS.ann, { colorScheme: theme })

    await sam.page.getByRole("button", { name: "Private mode", exact: true }).click()
    await expect.poll(() => s.round()?.byName).toBe(displayNameOf(USERS.sam))
    await addNote(sam.page, SECRET)
    // Sam's browser can't keep his words: he is told once, and the note still reaches nobody.
    // (exact: the toast's title, not the live region that reads it out)
    const told = sam.page.getByText("This browser can't keep your private notes", { exact: true })
    await expect(told).toBeVisible({ timeout: 10_000 })
    await expect(told).toHaveCount(1)
    // Work at risk: the toast is the amber warning, not the success check.
    await expect(sam.page.locator('[data-tone="warning"]').filter({ hasText: "This browser can't keep your private notes" })).toHaveCount(1)
    await expect.poll(() => s.elements().some((e) => e.customData?.privateBy === USERS.sam.user_uuid), { timeout: 10_000 }).toBe(true)
    expect(s.has(SECRET)).toBe(false)
    await reviewShot(sam.page, "m25-no-storage", theme)

    // On Ann's screen the note lies face down: its own yellow, its rounded corner, its edge, and whose it is.
    const veil = ann.page.locator("[data-private-veils] [role=note]")
    await expect(veil).toHaveAttribute("aria-label", `Private · ${displayNameOf(USERS.sam)}`)
    const look = await veil.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { fill: cs.backgroundColor, corner: Number.parseFloat(cs.borderTopLeftRadius), edge: cs.borderTopWidth, filter: cs.filter }
    })
    const yellow = NOTE_COLOURS.yellow.fill
    expect(look.fill).toBe(`rgb(${[1, 3, 5].map((i) => parseInt(yellow.slice(i, i + 2), 16)).join(", ")})`)
    expect(look.corner).toBeGreaterThan(20)
    expect(look.edge).not.toBe("0px")
    expect(look.filter === "none").toBe(theme === "light")
    await reviewShot(ann.page, "m25-veil", theme)

    // Sam selects every note and makes tasks: his own held note stays a note until the round ends, and the dialog
    // says so. (Ann can't pick his note at all: it reaches her locked.)
    await sam.page.locator(".excalidraw").first().focus()
    await sam.page.keyboard.press("ControlOrMeta+a")
    await sam.page.locator("[data-notes-bar]").getByRole("button", { name: /^Make (\d+ tasks|a task)$/ }).click()
    const dialog = sam.page.getByRole("dialog")
    await expect(dialog).toContainText("1 private note waits for the round to end.")
    await expect(dialog.getByRole("checkbox", { name: "Book the venue" })).toBeVisible()
    await reviewShot(sam.page, "m25-make-tasks", theme)
    await sam.context.close()
    await ann.context.close()
  })
