#!/usr/bin/env node
// The chat fluidity budgets (chat programme A5, perf-mobile.md PM-1 to PM-7):
// a channel opened cold until its first message shows, switching between
// conversations in the sidebar, typing in the composer, and reading back a
// long channel, each held to chat-budgets.json beside this file. The run
// exits non-zero when an enforced budget is missed. (PLATFORM-LEAD built the
// scenario on 17 Oct 2026; CHAT-LEAD owns the budgets.)
//
// It runs a production build (`next start`) against a fake server side
// (fakeApp.mjs) with a synthetic workspace: six channels, one of them 2,000
// messages long and paged as the server pages it, and three DMs, with a round
// trip of --rtt ms on every request. Nothing reaches the demo or any other
// server, so runs are comparable from one build to the next. The demo
// numbers (design/chat-vs-slack/perf-data/chatperf.mjs) are reported beside
// these for honesty; the budgets hold on these.
//
//   node scripts/fluidity/chat.mjs --base http://localhost:3171 --cpu 4
//   options: --runs 3  --rtt 150  --device desktop|phone  --only open,switch,type,scroll
//            --budgets <file>  --out <file.json>  --result <file> (rows, for run.mjs)
// Under Docker network churn, in its own namespace:
//   ~/bin/browser-isolated --forward 3171 -- node scripts/fluidity/chat.mjs ...
import { chromium } from "@playwright/test"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { check } from "./budgets.mjs"
import { USERS, fakeApp } from "./fakeApp.mjs"
import { installProbe, keyStats, mark, median, since } from "./lib.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const BASE = opt("base", "http://localhost:3000")
const CPU = Number(opt("cpu", 1))
const RUNS = Number(opt("runs", 3))
const RTT = Number(opt("rtt", 150))
const DEVICE = opt("device", "desktop")
const PHONE = DEVICE === "phone"
const ONLY = new Set(String(opt("only", "open,switch,type,scroll")).split(","))
const BUDGETS = JSON.parse(readFileSync(opt("budgets", join(here, "chat-budgets.json")), "utf8"))
const OUT = opt("out", null)
const SWITCHES = 12

// ---- the workspace ----
const ME = USERS.sam
const person = (n, name, full) => ({ user_uuid: `5a7a1c11-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`, user_name: name, user_full_name: full, user_email_id: `${name}@example.test` })
const PEOPLE = [person(1, "maya", "Maya Chen"), person(2, "jonas", "Jonas Weber"), person(3, "priya", "Priya Shah"), person(4, "tomas", "Tomás Ruiz")]
const SPEAKERS = [ME, ...PEOPLE]
const chId = (n) => `c4a70000-0000-4000-8000-${String(n).padStart(12, "0")}`
const CHANNELS = [
  { id: chId(1), name: "general", size: 2000 },
  { id: chId(2), name: "engineering", size: 80 },
  { id: chId(3), name: "design", size: 80 },
  { id: chId(4), name: "launch", size: 80 },
  { id: chId(5), name: "support", size: 80 },
  { id: chId(6), name: "random", size: 80 },
]
const LONG = CHANNELS[0]
const PAGE = 50

// Varied on purpose: rows of different heights are what makes a virtual list
// measure (as synth.mjs's bodies, which the demo walk uses).
const BODIES = [
  "<p>Merged. The staging deploy is running now.</p>",
  "<p>Can someone check the numbers on the pricing page against the plans before Thursday? The Business tier still says the old seat count in one place.</p>",
  "<p>Notes from the sync:</p><ul><li><p>Load test moves to Wednesday morning</p></li><li><p>Rollback steps are in the Launch sync notes</p></li><li><p>Legal signed off on the terms</p></li></ul>",
  "<p>Looks good to me.</p>",
  "<p>The import ran in 4 minutes on the copy of production. Two channels had attachments over the limit, so they came across as links. Everything else matched, including the threads and reactions.</p>",
  "<p>Who is on call Thursday? I want to put a name next to the rollback steps.</p>",
]
const NOW = Date.UTC(2026, 9, 17, 9, 0)
const at = (i) => new Date(NOW - i * 7 * 60_000).toISOString()
const postId = (c, i) => `${c.id.slice(0, 8)}-0000-4000-8000-${String(i).padStart(12, "0")}`

/** A channel's message i, newest first (0 is the latest). */
function post(c, i) {
  return {
    post_uuid: postId(c, i),
    post_text: `${BODIES[i % BODIES.length].replace("</p>", ` (${c.name} ${i})</p>`)}`,
    post_by: SPEAKERS[i % SPEAKERS.length],
    post_created_at: at(i),
    post_comment_count: i % 9 === 0 ? 2 : 0,
    post_comments: [],
    post_reactions: [],
    post_attachments: [],
  }
}
const pageOf = (c, from) => {
  const posts = []
  for (let i = from; i < Math.min(c.size, from + PAGE); i++) posts.push(post(c, i))
  return { posts, has_more: from + PAGE < c.size }
}
const channelInfo = (c) => ({
  ch_uuid: c.id,
  ch_name: c.name,
  ch_icon: "",
  ch_private: false,
  ch_is_user_fav: false,
  ch_about: `Where the team talks about ${c.name}.`,
  ch_call_active: false,
  unread_post_count: 0,
  ch_created_at: at(c.size + 10),
  ch_is_member: true,
  ch_posts: [],
  ch_created_by: ME,
  ch_member_count: SPEAKERS.length,
  ch_recording: [],
})
const dmGroup = (p) => [ME.user_uuid, p.user_uuid].sort().join(" ")
const chat = (p, i) => {
  const mine = i % 2 === 1
  return {
    chat_uuid: `0c4a${p.user_uuid.slice(-4)}-0000-4000-8000-${String(i).padStart(12, "0")}`,
    chat_from: mine ? ME : p,
    chat_to: mine ? p : ME,
    chat_created_at: at(i),
    chat_body_text: BODIES[(i + 1) % BODIES.length],
    chat_attachments: [],
    chat_comment_count: 0,
  }
}
const DMS = PEOPLE.slice(0, 3)

const ok = (data) => ({ msg: "ok", data })
const FIXTURES = [
  [/\/user\/sidebarNav$/, ok({ ...ME, user_channels: CHANNELS.map(channelInfo), user_dms: DMS.map((p) => ({ dm_grouping_id: dmGroup(p), dm_unread: 0, dm_participants: [ME, p], dm_notification_type: "all", dm_chats: [chat(p, 0)] })) })],
  [/\/ch\/channelBasicInfo\/[^/]+$/, (path) => ({ msg: "ok", channel_info: channelInfo(CHANNELS.find((c) => path.endsWith(c.id)) ?? CHANNELS[1]) })],
  [/\/ch\/userActiveChannelsWithLatestPost/, { msg: "ok", channels_list: CHANNELS.map(channelInfo) }],
  [/\/po\/latestPosts\/[^/]+$/, (path) => ok(pageOf(CHANNELS.find((c) => path.endsWith(c.id)) ?? CHANNELS[1], 0))],
  // An older page: the messages before the oldest one shown, which the client
  // names by its time in epoch seconds and, exactly, by ?at= (lib/chat/pageEdge).
  [/\/po\/oldPosts\/[^/]+\/\d+/, (path, url) => {
    const [, id, sec] = /\/po\/oldPosts\/([^/]+)\/(\d+)/.exec(path)
    const c = CHANNELS.find((x) => x.id === id) ?? LONG
    const at = url?.searchParams.get("at")
    const ms = at && !Number.isNaN(Date.parse(at)) ? Date.parse(at) : Number(sec) * 1000
    const from = Math.max(0, Math.round((NOW - ms) / (7 * 60_000)) + 1)
    return ok(pageOf(c, from))
  }],
  [/\/dm\/latestChat\/[^/]+$/, (path) => {
    const p = PEOPLE.find((x) => path.endsWith(x.user_uuid)) ?? PEOPLE[0]
    return ok({ chats: Array.from({ length: 60 }, (_, i) => chat(p, i)), has_more: false })
  }],
  [/\/user\/profile\/[^/]+$/, (path) => ok(PEOPLE.find((x) => path.endsWith(x.user_uuid)) ?? PEOPLE[0])],
  [/\/user\/dm-ai-suggestions$/, ok([])],
  [/\/dm\/?$/, ok([])],
]
// The collaboration server is never asked for on chat pages; fakeApp wants one.
const NO_COLLAB = { connect: () => ({ receive() {}, closed() {} }) }

const phoneOpts = {
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}
const viewport = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }

// ---- in the page: the first message row that wasn't there before ----
function watcher() {
  window.__rowAfter = (t0) => {
    window.__row = null
    const tick = (ts) => {
      const el = document.querySelector("[data-message-row]:not([data-old])")
      if (el && el.getClientRects().length > 0) window.__row = ts - t0
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
  // A cold open counts from the navigation's start.
  if (/^\/app\/(channel|chat)\//.test(location.pathname)) window.__rowAfter(0)
}
async function rowTime(page, ms = 30000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const t = await page.evaluate(() => window.__row).catch(() => null)
    if (typeof t === "number") return Math.round(t)
    await page.waitForTimeout(25)
  }
  return null
}

const browser = await chromium.launch()
async function newContext(log) {
  const context = await browser.newContext({ viewport, ...(PHONE ? phoneOpts : {}), serviceWorkers: "block" })
  await installProbe(context)
  await context.addInitScript(watcher)
  await fakeApp(context, { app: BASE, user: ME, docs: [], collab: NO_COLLAB, rtt: RTT, fixtures: FIXTURES, log })
  return context
}
async function newPage(context) {
  const page = await context.newPage()
  if (CPU > 1) {
    const cdp = await context.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  }
  return page
}

const result = { base: BASE, cpu: CPU, rtt: RTT, device: DEVICE, open: [], switches: [], typing: [], scroll: [], errors: [] }
for (let r = 0; r < RUNS; r++) {
  const log = []
  const context = await newContext(log)
  const page = await newPage(context)
  try {
    // ---- cold: a channel opened in a fresh tab ----
    const target = CHANNELS[1]
    await page.goto(`${BASE}/app/channel/${target.id}`, { waitUntil: "commit", timeout: 120000 })
    const first = await rowTime(page, 60000)
    await page.waitForTimeout(1500)
    if (ONLY.has("open")) result.open.push({ run: r, firstRowMs: first })

    // ---- switching: channel, DM, channel, ... through the sidebar ----
    if (ONLY.has("switch") && !PHONE) {
      const order = []
      for (let i = 0; i < SWITCHES; i++) order.push(i % 3 === 2 ? `/app/chat/${DMS[i % DMS.length].user_uuid}` : `/app/channel/${CHANNELS[1 + ((i + 1) % 5)].id}`)
      for (const href of order) {
        const before = await mark(page)
        const t0 = await page.evaluate((h) => {
          document.querySelectorAll("[data-message-row]").forEach((el) => el.setAttribute("data-old", ""))
          const a = document.querySelector(`a[href="${h}"]`)
          const t = performance.now()
          window.__rowAfter(t)
          if (a) a.click()
          return a ? t : null
        }, href)
        if (t0 == null) {
          result.errors.push(`run ${r}: no sidebar link to ${href}`)
          continue
        }
        const ms = await rowTime(page)
        await page.waitForTimeout(300)
        const m = await since(page, before)
        result.switches.push({ run: r, kind: href.startsWith("/app/chat/") ? "dm" : "channel", ms, renders: m.renders, longMs: m.longMs, cls: m.cls })
      }
    }

    // ---- typing in the composer ----
    if (ONLY.has("type")) {
      const box = page.locator("[data-composer] [contenteditable='true']").first()
      await box.click({ timeout: 15000 })
      const SENTENCE = "The rollback steps are in the launch notes."
      const before = await mark(page)
      await page.keyboard.type(SENTENCE, { delay: 45 })
      await page.waitForTimeout(600)
      const m = await since(page, before)
      const k = keyStats(m, SENTENCE.length)
      result.typing.push({ run: r, keyP95: k.p95, keyP50: k.p50, rendersPerKey: Math.round((m.renders / Math.max(k.typed, 1)) * 10) / 10 })
      // Never sent: the composer's text is left, and the fake answers no write that matters.
    }

    // ---- reading back the long channel: six pulls to the top ----
    if (ONLY.has("scroll")) {
      await page.goto(`${BASE}/app/channel/${LONG.id}`, { waitUntil: "commit", timeout: 120000 })
      await rowTime(page, 60000)
      await page.waitForTimeout(1200)
      const pagesBefore = log.filter((l) => l.includes("/po/oldPosts/")).length
      const before = await mark(page)
      // Each pull as the list loads (CHAT-LEAD, 17 Oct): it fetches an older
      // page on a real scroll event within 200 px of the top while it isn't
      // busy (aria-busy on the list). A landed page is prepended in place, so
      // scrollTop jumps down; a pull at 0 changes nothing, so it is nudged first.
      const notBusy = () => page.waitForFunction(() => document.querySelector("[data-list-content][role=list]")?.getAttribute("aria-busy") !== "true", null, { timeout: 10000 }).catch(() => {})
      for (let i = 0; i < 6; i++) {
        await notBusy()
        await page.evaluate(async () => {
          const c = document.querySelector("[data-list-content]")
          let el = c && c.parentElement
          while (el && !(el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement
          if (!el) return
          if (el.scrollTop <= 0) {
            el.scrollTop = 1
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
          }
          el.scrollTop = 0
        })
        await page.waitForTimeout(400)
        await notBusy()
        await page.waitForTimeout(300)
      }
      const m = await since(page, before)
      const rows = await page.evaluate(() => document.querySelectorAll("[data-message-row]").length)
      result.scroll.push({ run: r, olderPages: log.filter((l) => l.includes("/po/oldPosts/")).length - pagesBefore, rows, tbtMs: m.tbt, longMs: m.longMs })
    }
    const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null))
    result.heapMB = [...(result.heapMB ?? []), heap]
  } catch (e) {
    result.errors.push(`run ${r}: ${String(e?.message || e).split("\n")[0]}`)
  }
  await context.close()
}
await browser.close()

// ---- the summary, and the budgets ----
const p95 = (xs) => {
  const v = xs.filter((x) => typeof x === "number").sort((a, b) => a - b)
  return v.length ? v[Math.min(v.length - 1, Math.ceil(v.length * 0.95) - 1)] : null
}
const M = {}
if (result.open.length) M.coldOpenMs = median(result.open.map((o) => o.firstRowMs).filter((x) => x != null))
if (result.switches.length) {
  M.switchP95Ms = p95(result.switches.map((s) => s.ms))
  M.switchMedianMs = median(result.switches.map((s) => s.ms).filter((x) => x != null))
  M.rendersPerSwitch = median(result.switches.map((s) => s.renders).filter((x) => x != null))
  M.switchLongTaskMs = p95(result.switches.map((s) => s.longMs))
  // The demo's switches moved the page (CLS 0.13 on 17 Oct): a switch's shift.
  M.switchCls = p95(result.switches.map((s) => s.cls))
}
if (result.typing.length) {
  M.keyP95Ms = median(result.typing.map((t) => t.keyP95))
  M.rendersPerKey = median(result.typing.map((t) => t.rendersPerKey))
}
if (result.scroll.length) {
  M.scrollOlderPages = median(result.scroll.map((s) => s.olderPages))
  M.scrollTbtMs = median(result.scroll.map((s) => s.tbtMs).filter((x) => x != null))
}
if (result.heapMB?.length) M.heapMB = median(result.heapMB.filter((x) => x != null))
result.metrics = M

const rows = check(BUDGETS, M, { cpu: CPU, skipMissing: true })
result.budgets = rows
console.log(`chat.mjs cpu ${CPU}× rtt ${RTT} ms ${DEVICE} ${BASE}`)
console.log("metric".padEnd(24), "value".padStart(8), "max".padStart(8), "target".padStart(8), " owner ok")
for (const r of rows) {
  const verdict = r.ok === null ? (r.enforced ? "NOT MEASURED" : "n/a") : r.ok ? "ok" : r.enforced ? "MISSED" : "over (report only)"
  console.log(r.metric.padEnd(24), String(r.value).padStart(8), String(r.max).padStart(8), String(r.target ?? "").padStart(8), ` ${r.owner.padEnd(5)} ${verdict}`)
}
for (const e of result.errors) console.log(e)
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2))
if (opt("result", null)) writeFileSync(opt("result"), JSON.stringify({ scenario: "chat", cpu: CPU, metrics: M, checks: rows }, null, 2))
const failed = rows.filter((r) => r.enforced && r.ok !== true).length
if (failed) {
  console.log(`${failed} budget(s) missed or not measured`)
  process.exit(1)
}
