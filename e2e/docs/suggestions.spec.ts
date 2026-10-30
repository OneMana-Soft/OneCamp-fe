import { expect, test, type Browser, type Request, type TestInfo } from "@playwright/test"
import * as Y from "yjs"

import { SAM, SHOT_THEMES, reviewShot, type Answers } from "../stubbedApp"
import { openKeyboard, paintKeyboard } from "../keyboard"
import { docFromBlocks } from "../../scripts/fluidity/fakeCollab.mjs"
import { CollabRelay } from "./collabRelay"
import { PRIYA, openDocAs, type DocTab, type Person } from "./twoPeople"

// Suggesting (docs C5-1), in a doc two people have open, each in a browser of
// their own on A1's two-client harness. Sam, Suggesting, types over a word:
// the card opens with what he typed and the change is drawn as he goes, and
// nothing reaches the doc. Kept, it is counted by the title and listed beside
// the doc, and Priya accepts it in the doc, which writes it for both. On a
// phone, Suggest edit on the Formatting bar opens the card above the keyboard.
// The proposals API (business/Proposal) is answered here, one list for both.

const DOC = "c5100000-0000-4000-8000-000000000001"
const LINE = "Ship the beta on Friday."

test.describe.configure({ timeout: 180_000 })

type Proposal = Record<string, unknown> & { id: string; status: string }

/** The proposals the server keeps for the doc, read and written by each person as themselves. */
function proposalServer() {
  const kept: Proposal[] = []
  const decisions: Array<{ id: string; body: Record<string, unknown> }> = []
  const answersFor = (person: Person): Answers => ({
    "/proposals": (url: URL, request: Request) => {
      if (request.method() === "GET") return { msg: "ok", data: { proposals: kept } }
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>
      const [, id, verb] = url.pathname.match(/\/proposals\/([^/]+)\/(decide|withdraw)$/) ?? []
      if (!id) {
        const made: Proposal = {
          ...body,
          id: `s-${kept.length + 1}`,
          author_kind: "person",
          author_uuid: person.user_uuid,
          author_name: person.user_full_name,
          status: "open",
          created_at: new Date().toISOString(),
        }
        kept.unshift(made)
        return { msg: "ok", data: made }
      }
      const p = kept.find((k) => k.id === id)
      if (!p) return { msg: "ok", data: null }
      decisions.push({ id, body })
      p.status = verb === "withdraw" ? "withdrawn" : body.accept ? "accepted" : "declined"
      return { msg: "ok", data: p }
    },
  })
  return { kept, decisions, answersFor }
}

/** A doc whose one line is LINE, on the relay as the server holds it. */
function seeded(): CollabRelay {
  const relay = new CollabRelay()
  Y.applyUpdate(relay.doc(DOC), docFromBlocks([{ type: "paragraph", text: LINE }]).update)
  return relay
}

const serverText = (relay: CollabRelay) => relay.doc(DOC).getXmlFragment("default").toString()

function open(browser: Browser, testInfo: TestInfo, relay: CollabRelay, server: ReturnType<typeof proposalServer>, person: Person, theme: string, phone = false) {
  return openDocAs(browser, testInfo, relay, person, { id: DOC }, {
    phone,
    storage: { oc_keys_tip_seen: "1", "onecamp:demo-lead-dismissed": "1", "ui-theme": theme },
    answers: server.answersFor(person),
  })
}

/** A word of the doc's text: where it is drawn, and, when asked, chosen as a phone's selection handles choose it. */
function word(tab: DocTab, text: string, choose = false) {
  return tab.body.evaluate(
    (root, [w, pick]) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.textContent?.indexOf(w as string) ?? -1
        if (i < 0) continue
        const range = document.createRange()
        range.setStart(n, i)
        range.setEnd(n, i + (w as string).length)
        if (pick) {
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        }
        const box = range.getBoundingClientRect()
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      }
      throw new Error(`"${w}" isn't in the doc`)
    },
    [text, choose] as const,
  )
}

/**
 * A word chosen on a phone, as its selection handles choose it. A tap's own
 * caret can land after the word is chosen and empty the choice (c51fe-3 and
 * c51-iter10: the caret at the doc's end), so it taps the first line and
 * chooses the word again until the Formatting bar offers Suggest edit, which
 * it shows only for words chosen.
 */
async function chooseOnPhone(tab: DocTab, text: string) {
  await tab.body.tap({ position: { x: 24, y: 12 } })
  const suggestEdit = tab.page.getByRole("toolbar", { name: "Formatting" }).getByRole("button", { name: "Suggest edit" })
  await expect(async () => {
    await word(tab, text, true)
    await expect(suggestEdit).toBeVisible({ timeout: 1_000 })
  }).toPass()
  return suggestEdit
}

/**
 * Suggesting, from the header's mode menu. After a pick the menu fades out and
 * gives the focus back to its button only once it has gone (Radix's focus
 * return), so a word chosen and typed during the fade lost its last keys to the
 * button, and Control+Enter opened the menu again instead of keeping the card.
 */
async function suggestFromHeader(tab: DocTab) {
  await tab.page.getByRole("button", { name: "Editing: your changes go straight in" }).click()
  await tab.page.getByRole("menuitemradio", { name: /^Suggesting/ }).click()
  await expect(tab.page.getByRole("menu")).toHaveCount(0)
  await expect(tab.page.getByRole("button", { name: "Suggesting: your changes are suggestions" })).toBeFocused()
}

const struck = (tab: DocTab) => tab.body.locator('.oc-proposal-del[data-by="person"]')
const added = (tab: DocTab) => tab.body.locator('.oc-proposal-ins[data-by="person"]')
const chip = (tab: DocTab) => tab.page.locator("[data-suggestions-chip]")

test("a word typed fast over a word while Suggesting reaches the card whole, the keys before its focus too", async ({ browser }, testInfo) => {
  const relay = seeded()
  const server = proposalServer()
  const sam = await open(browser, testInfo, relay, server, SAM, "light")
  await expect(sam.body).toContainText(LINE, { timeout: 15_000 })
  await suggestFromHeader(sam)
  const friday = await word(sam, "Friday")
  await sam.page.mouse.dblclick(friday.x, friday.y)
  // No wait between the keys: the first opens the card, the rest come before its field has the focus.
  await sam.page.keyboard.type("Monday")
  const words = sam.page.getByRole("dialog", { name: "Suggest an edit" }).getByLabel("Suggest these words instead")
  await expect(words).toHaveValue("Monday")
  // Drawn as a suggestion, written nowhere.
  await expect(struck(sam)).toHaveText("Friday")
  await expect(added(sam)).toHaveText("Monday")
  expect(serverText(relay)).toContain("Friday")
  expect(serverText(relay)).not.toContain("Monday")
  await sam.close()
})

for (const theme of SHOT_THEMES) {
  test(`a doc under long-named pages keeps its title and the header's actions with the panel open beside it (${theme})`, async ({ browser }, testInfo) => {
    const relay = seeded()
    const server = proposalServer()
    const answers: Answers = {
      ...server.answersFor(SAM),
      [`/doc/ancestors/${DOC}`]: {
        data: {
          ancestors: [
            { kind: "doc", uuid: "c5100000-0000-4000-8000-0000000000a1", title: "Engineering handbook and onboarding", icon: "🛠️", has_children: true },
            { kind: "doc", uuid: "c5100000-0000-4000-8000-0000000000a2", title: "Quarterly planning for the platform team", has_children: true },
          ],
          truncated: false,
        },
      },
    }
    const sam = await openDocAs(browser, testInfo, relay, SAM, { id: DOC }, { storage: { oc_keys_tip_seen: "1", "onecamp:demo-lead-dismissed": "1", "ui-theme": theme }, answers })
    await expect(sam.body).toContainText(LINE, { timeout: 15_000 })
    await suggestFromHeader(sam)
    const friday = await word(sam, "Friday")
    await sam.page.mouse.dblclick(friday.x, friday.y)
    await sam.page.keyboard.type("Monday")
    await sam.page.keyboard.press("Control+Enter")
    await chip(sam).click()
    await expect(sam.page.locator('[data-suggestions-list] [data-suggestion="s-1"]')).toBeVisible()
    const header = sam.page.locator("[data-doc-header]")
    const edge = (await header.boundingBox())!
    // The header beside the open panel is under 640px, where the narrow rules hold.
    expect(edge.width).toBeLessThan(640)
    const title = (await header.locator('[data-doc-breadcrumbs] [aria-current="page"]').boundingBox())!
    const share = (await header.getByRole("button", { name: "Share" }).boundingBox())!
    expect(title.width).toBeGreaterThanOrEqual(80)
    expect(share.x + share.width).toBeLessThanOrEqual(edge.x + edge.width)
    // The pages above scroll out at the start, fading, and the trail rests at its end: the title.
    const trail = header.locator("[data-doc-breadcrumbs]")
    await expect.poll(() => trail.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft)).toBeLessThanOrEqual(1)
    expect(await trail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    await reviewShot(sam.page, "crumbs-nested-panel", theme)
    // A 1024 window lays the panel over the doc; the header has its room again.
    await sam.page.setViewportSize({ width: 1024, height: 900 })
    await expect.poll(() => trail.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft)).toBeLessThanOrEqual(1)
    await reviewShot(sam.page, "crumbs-nested-panel", theme)
    await sam.close()
  })
}

for (const theme of SHOT_THEMES) {
  test(`typing over a word while Suggesting is a suggestion, written nowhere until Priya accepts it, then for both (${theme})`, async ({ browser }, testInfo) => {
    const relay = seeded()
    const server = proposalServer()
    const sam = await open(browser, testInfo, relay, server, SAM, theme)
    await expect(sam.body).toContainText(LINE, { timeout: 15_000 })

    // Editing, then Suggesting, from the header.
    await suggestFromHeader(sam)

    // Typing over a word opens the card with what was typed; the change is drawn as it goes.
    const friday = await word(sam, "Friday")
    await sam.page.mouse.dblclick(friday.x, friday.y)
    await sam.page.keyboard.press("M")
    const card = sam.page.getByRole("dialog", { name: "Suggest an edit" })
    const words = card.getByLabel("Suggest these words instead")
    await expect(words).toBeFocused()
    await expect(words).toHaveValue("M")
    await sam.page.keyboard.type("onday")
    await expect(struck(sam)).toHaveText("Friday")
    await expect(added(sam)).toHaveText("Monday")
    await reviewShot(sam.page, "suggest-composer", theme)

    // ⌘↵ keeps it. Nothing in the doc changes; the title counts it.
    await sam.page.keyboard.press("Control+Enter")
    await expect(card).toHaveCount(0)
    await expect(chip(sam)).toHaveText("1 suggestion")
    await expect(struck(sam)).toHaveText("Friday")
    await expect(added(sam)).toHaveText("Monday")
    expect(server.kept.map((p) => p.status)).toEqual(["open"])
    expect(serverText(relay)).toContain("Friday")
    expect(serverText(relay)).not.toContain("Monday")

    // The list beside the doc holds it, for whoever may decide.
    await chip(sam).click()
    const row = sam.page.locator('[data-suggestions-list] [data-suggestion="s-1"]')
    await expect(row).toContainText("Your suggestion")
    await expect(row).toContainText("“Friday” to “Monday”")
    await expect(row.getByRole("button", { name: "Accept" })).toBeVisible()
    await expect(row.getByRole("button", { name: "Decline" })).toBeVisible()
    // With the panel open the header narrows: the title keeps its room, and the chip stands after it.
    const title = await sam.page.locator('[data-doc-breadcrumbs] [aria-current="page"]').boundingBox()
    const counted = await chip(sam).boundingBox()
    expect(title!.width).toBeGreaterThanOrEqual(80)
    expect(title!.x + title!.width).toBeLessThanOrEqual(counted!.x)
    // And the header's actions stay in it.
    const header = await sam.page.locator("[data-doc-header]").boundingBox()
    const share = await sam.page.locator("[data-doc-header]").getByRole("button", { name: "Share" }).boundingBox()
    expect(share!.x + share!.width).toBeLessThanOrEqual(header!.x + header!.width)
    await reviewShot(sam.page, "suggestions-list", theme)

    // Priya, who may edit, sees it drawn as Sam's, and accepts it in the doc: written for both.
    const priya = await open(browser, testInfo, relay, server, PRIYA, theme)
    await expect(chip(priya)).toHaveText("1 suggestion", { timeout: 15_000 })
    await struck(priya).click()
    const bar = priya.page.getByRole("toolbar", { name: "Review the proposed change" })
    await expect(bar).toContainText("Suggested by Sam Rivera")
    await bar.getByRole("button", { name: "Accept", exact: true }).click()
    await expect.poll(() => server.decisions.map((d) => [d.id, d.body.accept, d.body.apply])).toEqual([["s-1", true, "client"]])
    await expect(priya.body).toContainText("Ship the beta on Monday.")
    await expect.poll(() => serverText(relay)).toContain("Monday")
    expect(serverText(relay)).not.toContain("Friday")
    await expect(chip(priya)).toHaveCount(0)
    await sam.close()
    await priya.close()
  })

  test(`on a phone, a word the keyboard composes over a word while Suggesting opens the card with it, and writes nothing (${theme})`, async ({ browser }, testInfo) => {
    const relay = seeded()
    const server = proposalServer()
    const sam = await open(browser, testInfo, relay, server, SAM, theme, true)
    await expect(sam.body).toContainText(LINE, { timeout: 15_000 })
    // A phone draws no doc header: Suggesting is on the doc's sheet, named by the mode it's in.
    const options = async () => {
      await sam.page.getByRole("button", { name: "Document options" }).tap()
      const sheet = sam.page.locator('[data-v3-sheet][data-detent="menu"]')
      await expect(sheet).toBeVisible({ timeout: 30_000 })
      return sheet
    }
    await (await options()).getByRole("button", { name: "Suggest changes" }).tap()
    await expect((await options()).getByRole("button", { name: "Stop suggesting" })).toBeVisible()
    await sam.page.keyboard.press("Escape")
    await chooseOnPhone(sam, "Friday")

    // A phone's keyboard types through composition (IME), not key by key.
    // Its first letters start in the doc; the composer opens and takes the
    // focus, which commits them there, and the keyboard composes the rest in
    // the field.
    const cdp = await sam.page.context().newCDPSession(sam.page)
    await cdp.send("Input.imeSetComposition", { text: "Mo", selectionStart: 2, selectionEnd: 2 })
    const card = sam.page.getByRole("dialog", { name: "Suggest an edit" })
    const field = card.getByLabel("Suggest these words instead")
    await expect(field).toBeFocused()
    await expect(field).toHaveValue("Mo")
    await cdp.send("Input.imeSetComposition", { text: "nd", selectionStart: 2, selectionEnd: 2 })
    await cdp.send("Input.insertText", { text: "nday" })
    await expect(field).toHaveValue("Monday")
    await expect(struck(sam)).toHaveText("Friday")
    expect(serverText(relay)).toContain("Friday")
    expect(serverText(relay)).not.toContain("Monday")
    await sam.close()
  })

  test(`on a phone, Suggest edit on the Formatting bar opens the card above the keyboard, and keeps the suggestion (${theme})`, async ({ browser }, testInfo) => {
    const relay = seeded()
    const server = proposalServer()
    const sam = await open(browser, testInfo, relay, server, SAM, theme, true)
    await expect(sam.body).toContainText(LINE, { timeout: 15_000 })
    await (await chooseOnPhone(sam, "Friday")).tap()

    const card = sam.page.getByRole("dialog", { name: "Suggest an edit" })
    const words = card.getByLabel("Suggest these words instead")
    await expect(words).toHaveValue("Friday")
    await expect(words).toBeFocused()
    // A phone's overlay is a sheet, its actions in a pinned footer (the shared ResponsiveSheet).
    await expect(card).toHaveAttribute("data-v3-sheet", "")
    const footer = card.locator("[data-sheet-footer]")
    await expect(footer.getByRole("button", { name: "Suggest" })).toBeVisible()
    await expect(footer.getByRole("button", { name: "Cancel" })).toBeVisible()
    // With the keyboard down, the sheet hugs what it holds.
    await reviewShot(sam.page, "suggest-composer-sheet", theme)
    const close = await openKeyboard(sam.page, "visual")
    const keyboardTop = await sam.page.evaluate(() => Math.round(window.visualViewport?.height ?? window.innerHeight))
    const cardBottom = async () => {
      const box = await card.boundingBox()
      return box ? Math.round(box.y + box.height) : Infinity
    }
    await expect.poll(cardBottom).toBeLessThanOrEqual(keyboardTop)
    await words.fill("Monday")
    await expect(added(sam)).toHaveText("Monday")
    // With it up, the sheet's footer rests on it.
    const unpaint = await paintKeyboard(sam.page)
    await reviewShot(sam.page, "suggest-composer", theme)
    await unpaint()

    await card.getByRole("button", { name: "Suggest" }).tap()
    await expect(card).toHaveCount(0)
    await close()
    expect(serverText(relay)).not.toContain("Monday")
    await expect(chip(sam)).toHaveText("1 suggestion")
    await chip(sam).tap()
    await expect(sam.page.locator('[data-suggestions-list] [data-suggestion="s-1"]')).toContainText("“Friday” to “Monday”")
    await reviewShot(sam.page, "suggestions-list", theme)
    await sam.close()
  })
}
