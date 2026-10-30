import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { LAUNCH, MAYA, POST, VIEWS, openChannel } from "./channelPage"
import { hoverWhenReachable } from "./menuReach"
import { holdUntil } from "./sheetLayout"
import { AI_ON, AI_READS, SHOT_THEMES, appOrigin, reviewShot } from "./stubbedApp"

// This edition's build has none of these add-ons, so here every case, with the
// server's AI on or off, finds none of them and no trace of where they were.
// Every AI entry a person meets on a message is the AI edition's add-on (chat
// E1, lib/addOns): Translate in a message's More menu on a computer and in its
// sheet on a phone, and "Ask AI about this image" and "Summarise with AI" in
// the attachment viewer's bar. With AI off none of them is there, and nothing
// marks where they were: no blank row, no empty group, no wider space in the
// bar. "Off" is this build with the server's ai feature off, which draws as
// the AI-free edition does (its build has none of the add-ons). With
// SHOTS=<dir> each is saved at 1280 and 390, light and dark, as
// e1-<surface>-ai-on and e1-<surface>-ai-off.

// The channel page's other reads (AI's among them), answered empty in both
// editions, so no "Not in this test" toast lands in a shot.
const READS = {
  ...AI_READS,
  "/agent-card/channel": { msg: "ok", data: [] },
  "/ai/memory/channel-exclusion": { msg: "ok", data: { excluded: false } },
}
const AI_ENTRY = /Translate|Ask AI|with AI/

// Where the files are: a path of the app's own origin, the one place outside
// the API the content policy lets a picture or a read come from (a host of
// their own was refused, so the picture never drew).
const FILES = "/e2e-files/"
const file = (n: number, name: string, type: string, raw: string) => ({
  attachment_uuid: `0c4b0000-0000-4000-8000-0000000005${n}0`, attachment_file_name: name, attachment_obj_key: `ch/${name}`,
  attachment_type: type, attachment_raw_type: raw, attachment_size: 18_204, attachment_created_at: "2026-10-19T09:31:00Z",
})
const BANNER = file(1, "launch-banner.png", "image", "image/png")
const CHECKLIST = file(2, "launch-checklist.txt", "document", "text/plain")
const WITH_FILES = { ...POST, post_uuid: "0c4a0000-0000-4000-8000-000000000502", post_by: MAYA, post_created_at: "2026-10-19T09:31:00Z",
  post_text: "<p>The banner and the checklist for Thursday.</p>", post_attachments: [BANNER, CHECKLIST] }
const BODIES: Record<string, { contentType: string; body: string }> = {
  [BANNER.attachment_file_name]: {
    contentType: "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff8a4c"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><text x="80" y="345" font-family="sans-serif" font-size="96" font-weight="700" fill="#fff">Launch · Thursday</text></svg>`,
  },
  [CHECKLIST.attachment_file_name]: { contentType: "text/plain", body: "Launch checklist\n\n- Staging is green\n- The banner has the new date\n- Support knows the time\n" },
}

/** Each file's body at FILES (the text viewer fetches it). */
function serveFiles(tab: Page) {
  return tab.route(`**${FILES}*`, (route) => {
    const found = BODIES[new URL(route.request().url()).pathname.slice(FILES.length)]
    return found ? route.fulfill({ status: 200, contentType: found.contentType, body: found.body }) : route.fulfill({ status: 404 })
  })
}

/** The channel's reads: Jonas's message, then Maya's with a picture and a document at FILES. */
function withFiles(testInfo: TestInfo, ai: boolean) {
  return () => ({
    ...READS,
    ...(ai ? AI_ON : {}),
    [`/po/latestPosts/${LAUNCH}`]: { msg: "ok", data: { posts: [WITH_FILES, POST], has_more: false } },
    [`/ch/getFile/${LAUNCH}/`]: (url: URL) => {
      const named = [BANNER, CHECKLIST].find((f) => url.pathname.endsWith(f.attachment_uuid))
      return { msg: "ok", url: new URL(`${FILES}${named?.attachment_file_name}`, appOrigin(testInfo)).href }
    },
  })
}

/**
 * A list's rows and separators, top to bottom, leave no trace of a row that
 * isn't there: no blank row, no separator at an end or beside another, and
 * rows with no separator between them touch.
 */
async function expectNoGap(list: Locator, rows: string) {
  const parts = await list.evaluate((el, rows) => [...el.querySelectorAll(`${rows}, [role="separator"]`)].map((p) => {
    const r = p.getBoundingClientRect()
    return { sep: p.getAttribute("role") === "separator", top: r.top, bottom: r.bottom, text: p.textContent?.trim() ?? "" }
  }), rows)
  expect(parts.filter((p) => !p.sep && !p.text), "a blank row").toEqual([])
  expect(parts[0]?.sep || parts.at(-1)?.sep, "a separator at an end").toBeFalsy()
  for (let i = 1; i < parts.length; i++) {
    expect(parts[i - 1].sep && parts[i].sep, `two separators together, after "${parts[i - 2]?.text}"`).toBe(false)
    if (!parts[i - 1].sep && !parts[i].sep) expect(Math.round(parts[i].top - parts[i - 1].bottom), `the space after "${parts[i - 1].text}"`).toBeLessThanOrEqual(1)
  }
}

/** The viewer's bar: its buttons, left to right, evenly spaced, whatever it holds. */
async function expectEvenBar(viewer: Locator) {
  const gaps = await viewer.getByRole("button", { name: "Close" }).locator("xpath=..").evaluate((bar) => {
    const boxes = [...bar.children].map((b) => b.getBoundingClientRect())
    return boxes.slice(1).map((b, i) => Math.round(b.left - boxes[i].right))
  })
  expect(new Set(gaps).size, `the bar's spaces ${gaps.join(", ")}`).toBe(1)
}

for (const view of VIEWS) {
  for (const scheme of SHOT_THEMES) {
    for (const ai of [true, false]) {
      const edition = ai ? "ai-on" : "ai-off"
      test(`at ${view.name}, ${scheme}, AI ${ai ? "on" : "off"}: a message's actions and its files' viewer hold no trace of AI`, async ({ browser }, testInfo) => {
        test.setTimeout(300_000)
        const tab = await openChannel(browser, testInfo, view, scheme, withFiles(testInfo, ai), serveFiles)

        // A message's actions: its More menu on a computer, its sheet on a phone.
        const row = tab.locator("[data-message-row]").filter({ hasText: "Staging is green." }).first()
        let actions: Locator
        if (view.phone) {
          actions = tab.locator("[data-message-sheet]")
          await holdUntil(tab, row.getByText("Staging is green."), actions)
          await expectNoGap(actions.getByRole("button", { name: "Copy text" }).locator("xpath=.."), "button")
        } else {
          await hoverWhenReachable(row)
          await row.getByRole("button", { name: "More actions" }).click()
          actions = tab.getByRole("menu").filter({ has: tab.getByRole("menuitem", { name: /Copy text/ }) })
          await expect(actions).toBeVisible()
          await expectNoGap(actions, '[role^="menuitem"]')
        }
        const translate = actions.getByRole(view.phone ? "button" : "menuitem", { name: "Translate" })
        await expect(translate).toHaveCount(0)
        await expect(actions.getByText(AI_ENTRY)).toHaveCount(0)
        await reviewShot(tab, `e1-message-${edition}`, scheme)
        await tab.keyboard.press("Escape")
        await expect(actions).toBeHidden()

        // The attachment viewer: a picture, then a document.
        const files = tab.locator("[data-message-row]").filter({ hasText: "The banner and the checklist" }).first()
        for (const [f, entry, shot] of [[BANNER, "Ask AI about this image", "image"], [CHECKLIST, "Summarise with AI", "document"]] as const) {
          const open = files.getByRole("button", { name: `Open ${f.attachment_file_name}` })
          if (view.phone) await open.tap()
          else await open.click()
          const viewer = tab.locator("[data-lightbox]")
          // Its title is also the dialog's sr-only name; the bar shows it.
          await expect(viewer.getByText(f.attachment_file_name).filter({ visible: true }).first()).toBeVisible()
          if (f === BANNER) await expect.poll(() => viewer.locator("img").evaluateAll((imgs) => imgs.some((i) => (i as HTMLImageElement).naturalWidth > 0))).toBe(true)
          else await expect(viewer.getByText("The banner has the new date")).toBeVisible()
          await expect(viewer.getByRole("button", { name: entry })).toHaveCount(0)
          await expect(viewer.getByRole("button", { name: AI_ENTRY })).toHaveCount(0)
          await expectEvenBar(viewer)
          await reviewShot(tab, `e1-viewer-${shot}-${edition}`, scheme)
          await viewer.getByRole("button", { name: "Close" }).click()
          await expect(viewer).toBeHidden()
        }
        await tab.context().close()
      })
    }
  }
}

/** How far the scroller holding `el` is scrolled down. */
function scrolledBy(el: Element) {
  let scroller = el.parentElement
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
  return scroller?.scrollTop ?? 0
}

/**
 * Plays the hover toolbar's own entrance (its .animate-toolbar-in rule) on every toolbar drawn
 * from now on, over `ms`: a click then lands inside it, whether or not this hover would play it.
 */
async function holdEntrance(tab: Page, ms: number) {
  await tab.evaluate((ms) => {
    const flat = (list: CSSRuleList): CSSRule[] =>
      [...list].flatMap((r) => (r instanceof CSSMediaRule ? [] : [r, ...("cssRules" in r ? flat((r as CSSGroupingRule).cssRules) : [])]))
    const entrance = [...document.styleSheets].flatMap((s) => flat(s.cssRules)).find((r) => (r as CSSStyleRule).selectorText === ".animate-toolbar-in")
    const name = (entrance as CSSStyleRule | undefined)?.style.animationName
    if (!name) throw new Error("no .animate-toolbar-in rule")
    const style = document.createElement("style")
    style.textContent = `[data-message-toolbar] { animation: ${name} ${ms}ms linear both !important }`
    document.head.append(style)
  }, ms)
}

// The More click above failed under load (CALLS-LEAD-23, 27 Oct). The toolbar entered by moving
// 2px and .98 for 120 ms; a click checked inside that window found More moving, and Playwright's
// retry scrolled More into view, which took this list, scrolled 181 px, to its top. The row left
// the pointer and its toolbar went. A click target never moves: the entrance is a fade. The
// hover waits for the row to take the pointer, which the list holds back while it re-pins.
test("at 1280, More opens while its toolbar enters, with the list scrolled", async ({ browser }, testInfo) => {
  test.setTimeout(150_000)
  const tab = await openChannel(browser, testInfo, VIEWS[0], "light", withFiles(testInfo, false), serveFiles)
  const row = tab.locator("[data-message-row]").filter({ hasText: "Staging is green." }).first()
  await expect.poll(() => row.evaluate(scrolledBy)).toBeGreaterThan(100)
  await holdEntrance(tab, 8_000)
  await hoverWhenReachable(row)
  await row.getByRole("button", { name: "More actions" }).click({ timeout: 5_000 })
  await expect(tab.getByRole("menu").filter({ has: tab.getByRole("menuitem", { name: /Copy text/ }) })).toBeVisible()
  await tab.context().close()
})
