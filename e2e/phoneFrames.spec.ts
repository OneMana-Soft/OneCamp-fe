import { expect, test, type Page } from "@playwright/test"

import { SAM, stubBackend, type Answers } from "./stubbedApp"

// A phone's lists end clear of the tab bar (DESIGN-BUILD-16, 25 Oct 2026). Channels, DMs and Inbox draw a
// large title over the page, and each page is a full-height column with its own scrolling list: the list ran
// under the fixed tab bar, so at its end the last row, a "Loading…" foot or a Try again sat in the bar's band
// (y 788 to 844 at 390), where nothing can be seen or tapped. toBeVisible() passes under a covering bar, so
// these ask the page what is on top at the row's middle, and at the foot's.

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const ROWS = 40
// What a list may leave over the tab bar at its end: its frame's room (the DM list's end sat 33px over the bar),
// never a blank of its own as well (the channel list's virtual list left 199px under its foot).
const END_ROOM = 48
const at = (i: number) => new Date(Date.UTC(2026, 9, 25, 9, 0) - i * 60_000).toISOString()

const person = (i: number) => ({ user_uuid: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, user_name: `person${i}`, user_full_name: `Person ${i}` })
const dms = Array.from({ length: ROWS }, (_, i) => ({
  dm_grouping_id: `${SAM.user_uuid} ${person(i).user_uuid}`,
  dm_unread: 0,
  dm_last_chat_at: at(i),
  dm_participants: [{ ...SAM }, person(i)],
  dm_chats: [{ chat_uuid: `c-${i}`, chat_body_text: `<p>Message ${i}</p>`, chat_created_at: at(i), chat_from: person(i) }],
}))

const channels = Array.from({ length: ROWS }, (_, i) => ({
  ch_uuid: `c4a10000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ch_name: `team-${i + 1}`,
  ch_icon: "",
  ch_private: false,
  ch_is_user_fav: false,
  ch_about: "",
  ch_call_active: false,
  unread_post_count: 0,
  ch_created_at: "2026-09-01T09:00:00Z",
  ch_is_member: true,
  ch_posts: [],
  ch_created_by: SAM,
  ch_member_count: 2,
  ch_recording: [],
  notification_type: "all",
}))

const notices = Array.from({ length: ROWS }, (_, i) => ({
  activity_type: "NOTICE",
  time: at(i),
  priority: "normal",
  actor_kind: "person",
  notice: {
    id: `0b9e6a52-1c3d-4f7e-8a2b-${String(i + 1).padStart(12, "0")}`,
    kind: "doc.mentioned",
    resource_kind: "doc",
    resource_uuid: `7d1e5c2a-9b3f-4a6e-8c1d-${String(i + 1).padStart(12, "0")}`,
    title: `Launch notes ${i + 1}`,
    can_open: true,
    reason: "mention",
    actor: person(i),
    created_at: at(i),
  },
}))

/** `foot`: the words of what the list ends with at rest, checked as its last row is. */
const PAGES: { name: string; path: string; answers: Answers; rows: string; foot?: string }[] = [
  {
    name: "Direct messages",
    path: "/app/chat",
    answers: { "/dm/getLatestChatList": { msg: "ok", data: { ...SAM, user_dms: dms } } },
    rows: "[data-list-frame] a",
  },
  {
    // A page of the size asked for, and the next page never answered: the list ends with its "Loading more…"
    // foot. Answered whole each time, a page as long as the size kept "more" true, and the list asked again
    // and again and never came to rest.
    name: "Channels",
    path: "/app/channel",
    answers: {
      "/ch/userActiveChannelsWithLatestPost": (url: URL) =>
        Number(url.searchParams.get("pageIndex")) > 0
          ? new Promise(() => {})
          : { msg: "ok", channels_list: channels.slice(0, Number(url.searchParams.get("pageSize"))) },
    },
    rows: 'a[href^="/app/channel/c4a10000-"]',
    foot: "Loading more…",
  },
  {
    // The Inbox's other reads answered too: the stub's "Not in this test" toast sits just over the tab bar, where
    // the list's last row now ends.
    name: "Inbox",
    path: "/app/inbox",
    answers: {
      "/activity/unified": { msg: "ok", data: { has_more: false, activities: notices } },
      "/chat-threads/unread": { msg: "ok", data: { unread: 0 } },
      "/activity/seen": { msg: "ok" },
    },
    rows: "[data-feed-row]",
  },
]

/** Every list in the page at its end, as a thumb takes it; again while a virtual list grows as it renders. */
async function toTheEnd(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          let moved = 0
          for (const el of document.querySelectorAll<HTMLElement>("[data-app-scroller] *")) {
            const { overflowY } = getComputedStyle(el)
            if ((overflowY !== "auto" && overflowY !== "scroll") || el.scrollHeight <= el.clientHeight + 1) continue
            if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) {
              el.scrollTop = el.scrollHeight
              moved++
            }
          }
          return moved
        }),
      { message: "every list at its end" },
    )
    .toBe(0)
}

/**
 * At the lists' end: the lowest row (a virtual list keeps rows in the DOM out of order) and the page's foot, each
 * with whether it is the top thing at its middle, where its middle is and where it ends; what the row links to;
 * and where the lowest box in any list ends, against the tab bar's top edge. A page without the bar fails here.
 */
function atTheEnd(page: Page, rows: string, foot?: string) {
  return page.evaluate(
    ({ rows, foot }) => {
      const nav = document.querySelector('nav[aria-label="Primary"]')
      if (!nav) throw new Error('the tab bar (nav "Primary") is not on the page')
      const lowest = (els: Iterable<Element>) => {
        let low: Element | null = null
        for (const el of els) {
          const r = el.getBoundingClientRect()
          if (r.height > 0 && (!low || r.bottom > low.getBoundingClientRect().bottom)) low = el
        }
        return low
      }
      const seen = (el: Element | null) => {
        const r = el?.getBoundingClientRect()
        const x = r ? r.left + r.width / 2 : NaN
        const y = r ? r.top + r.height / 2 : NaN
        const top = r ? document.elementFromPoint(x, y) : null
        return { covered: !(el && top && el.contains(top)), bottom: Math.round(r?.bottom ?? Infinity), x, y }
      }
      const inPage = [...document.querySelectorAll<HTMLElement>("[data-app-scroller] *")]
      const frames = inPage.filter((el) => {
        const { overflowY } = getComputedStyle(el)
        return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1
      })
      const ends = frames.map((f) => Math.round(lowest(f.querySelectorAll("*"))?.getBoundingClientRect().bottom ?? 0))
      const row = lowest(document.querySelectorAll(rows))
      return {
        ...seen(row),
        href: (row?.closest("a[href]") ?? row?.querySelector("a[href]"))?.getAttribute("href") ?? "",
        foot: foot ? seen(lowest(inPage.filter((el) => !el.childElementCount && el.textContent?.trim() === foot))) : null,
        end: Math.max(0, ...ends),
        bar: Math.round(nav.getBoundingClientRect().top),
      }
    },
    { rows, foot },
  )
}

for (const { name, path, answers, rows, foot } of PAGES) {
  test(`${name}: at the list's end its last row and foot are above the tab bar, and the row takes a tap`, async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await stubBackend(page, testInfo, answers)
    await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator(rows).first()).toBeVisible({ timeout: 60_000 })
    await toTheEnd(page)
    if (foot) {
      // The foot comes once the end is near, under what was the end.
      await expect(page.getByText(foot, { exact: true })).toBeAttached()
      await toTheEnd(page)
    }
    await expect
      .poll(() => atTheEnd(page, rows, foot), { message: `${name}: the last row, and the foot, are each the top thing at their middle` })
      .toMatchObject({ covered: false, foot: foot ? { covered: false } : null })
    const at = await atTheEnd(page, rows, foot)
    expect(at.bottom, `${name}: the last row ends above the tab bar`).toBeLessThanOrEqual(at.bar)
    if (at.foot) expect(at.foot.bottom, `${name}: its "${foot}" foot ends above the tab bar`).toBeLessThanOrEqual(at.bar)
    expect(at.end, `${name}: what a list ends with ends above the tab bar`).toBeLessThanOrEqual(at.bar)
    expect(at.bar - at.end, `${name}: the list leaves its frame's room over the tab bar, and none of its own`).toBeLessThanOrEqual(END_ROOM)

    // A finger at the last row's middle opens what the row links to.
    expect(at.href, `${name}: the last row links to what it opens`).not.toBe("")
    const opens = new URL(at.href, page.url()).pathname
    await page.touchscreen.tap(at.x, at.y)
    await expect(page, `${name}: the tap opens ${opens}`).toHaveURL((url) => url.pathname === opens)
  })
}

// The Inbox's who band (Everyone / People / Apps) sits over its list, and rows run up under it with no cue. It draws
// the hairline an overlay's header draws while the list has more above, and none at the list's top (app/hub.css).
// The band is the same at a computer's width.
for (const [width, height, phone] of [
  [390, 844, true],
  [1280, 800, false],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`the Inbox's who band at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone })

      test("draws a hairline only while rows run under it", async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, PAGES.find((p) => p.name === "Inbox")!.answers)
        await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.locator("[data-feed-row]").first()).toBeVisible({ timeout: 60_000 })
        const band = page.locator("[data-feed-toolbar]")
        const line = () => band.evaluate((el) => getComputedStyle(el).boxShadow)
        // The list's scroller, moved to `to`.
        const scrollList = (to: number) =>
          page.locator("[data-feed-body]").evaluate((body, to) => {
            const list = [...body.querySelectorAll<HTMLElement>("*")].find(
              (el) => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1,
            )
            if (!list) throw new Error("the Inbox's list has no more than its room")
            list.scrollTop = to
          }, to)
        const shot = async (name: string) => {
          if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/inbox-band-${name}-${width}-${theme}.png` })
        }
        await expect.poll(line, { message: "the band at the list's top" }).toBe("none")
        await shot("top")
        await scrollList(160)
        await expect.poll(line, { message: "the band while rows run under it" }).not.toBe("none")
        await shot("scrolled")
        await scrollList(0)
        await expect.poll(line, { message: "the band back at the list's top" }).toBe("none")
      })
    })
  }
}
