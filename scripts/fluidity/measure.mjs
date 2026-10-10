#!/usr/bin/env node
// How fast and smooth the app feels, measured on the 15 interactions people do
// most. Wave 2 of the design work (10 Oct 2026) built it; rerun it before and
// after any change that could touch fluidity, and compare the tables.
//
//   pnpm next build && pnpm next start -p 3171        # production numbers
//   node scripts/fluidity/measure.mjs --base http://localhost:3171 --label before --out /tmp/flu
//
// Options:
//   --runs 3        runs per step; the table shows medians
//   --cpu 4         CPU slowdown (4 = a mid laptop on battery, roughly a phone)
//   --only 3,5      just these steps (step 1 always runs: it signs in)
//   --routes        also load each route cold and record its JavaScript
//   --shots         screenshot each step into --out
//
// The demo's data, this checkout's code: see lib.mjs. NOTHING IS WRITTEN TO THE
// SHARED DEMO: writes are aborted, and the two the steps make on purpose (send,
// drag) are answered with a fake success.
//
// Per step: ready (ms from the input to the content showing, in the page),
// inp (the slowest interaction, input to next paint), keys (per-keystroke
// latency when typing), long tasks and blocking time, layout shift, script
// downloaded (gzip KB), React commits and component renders, and what moved:
// any animation or transition of a layout property is printed as LAYOUT
// MOTION. Steps 15 and 16 also check the playful layer's colour: every avatar
// fallback and identity mark drawn from the camp tokens, none from images.
//
// Why a render count moved: build with `next build --no-mangling --profile`
// and the JSON gains component names, the components that started each
// render (origins, with the hook or context that changed) and ms per
// component.
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { launch, demoContext, enterDemo, fakeWrite, mark, since, keyStats, median, FE } from "./lib.mjs"
import { longChannel, longThread, manyMembers } from "./synth.mjs"

const args = process.argv.slice(2)
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  if (i < 0) return dflt
  const v = args[i + 1]
  return v === undefined || v.startsWith("--") ? true : v
}
const BASE = opt("base", "http://localhost:3171")
const LABEL = opt("label", "run")
const OUT = opt("out", "/tmp/fluidity")
const RUNS = Number(opt("runs", 3))
const CPU = Number(opt("cpu", 4))
const ONLY = opt("only", "") ? String(opt("only", "")).split(",").map(Number) : null
const SHOTS = !!opt("shots", false)
const ROUTES = !!opt("routes", false)
mkdirSync(OUT, { recursive: true })

// The demo's fixed things. If the seed changes, these are what to update.
const DEMO = {
  engineering: /^engineering/,
  design: /^design/,
  general: /^general/,
  designText: "Final hero for the launch page",
  engineeringText: "Release candidate for the Q4 launch",
  project: "Q4 launch",
  task: "Review the pricing page copy",
  doc: "Q4 launch plan",
  docText: "We launch on the last Tuesday",
}
// --only 3 takes step 3 and its parts (3.1).
const want = (n) => !ONLY || n === 1 || ONLY.includes(n) || ONLY.includes(Math.floor(n))

// In-page readiness, polled every frame: time from the last input to the
// moment the predicate holds, measured where the user is.
async function readyWhen(page, predicate, arg, timeout = 30000) {
  const handle = await page.waitForFunction(
    ({ src, arg }) => {
      // eslint-disable-next-line no-new-func
      const ok = new Function("arg", `return (${src})(arg)`)(arg)
      return ok ? performance.now() - (window.__fluInputAt || performance.now()) : false
    },
    { src: predicate.toString(), arg },
    { polling: "raf", timeout },
  )
  return Math.round(await handle.jsonValue())
}
// Text that is on screen (in the DOM, laid out, not hidden), optionally under a
// selector and only once the address is the page's (Home quotes some of the
// same lines, so a step from Home would otherwise be ready before it began).
const shows = ({ text, within, path }) => {
  if (path && !location.pathname.includes(path)) return false
  const root = within ? document.querySelector(within) : document.body
  if (!root) return false
  const x = document.evaluate(`.//*[contains(normalize-space(.), ${JSON.stringify(text)}) and not(*[contains(normalize-space(.), ${JSON.stringify(text)})])]`, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
  const el = x.singleNodeValue
  return !!el && el.checkVisibility() && el.getClientRects().length > 0
}
const exists = ({ sel, path }) => {
  if (path && !location.pathname.includes(path)) return false
  const el = document.querySelector(sel)
  return !!el && el.checkVisibility()
}

// The playful layer's colour, checked where it is drawn: every avatar
// fallback's ground and every identity mark's fill must be one of the camp
// tokens (resolved here from the stylesheet), and none of it an image.
function colourAudit(within) {
  const root = document.querySelector(within) || document.body
  const probe = document.createElement("span")
  document.body.appendChild(probe)
  const tints = new Set()
  const strong = new Set()
  for (const h of ["sun", "moss", "lake", "sky", "dusk", "berry"]) {
    probe.style.backgroundColor = `var(--camp-${h}-tint)`
    tints.add(getComputedStyle(probe).backgroundColor)
    probe.style.backgroundColor = `var(--camp-${h})`
    strong.add(getComputedStyle(probe).backgroundColor)
  }
  probe.remove()
  const avatars = [...root.querySelectorAll(".bg-hue-tint")].filter((el) => el.checkVisibility())
  const marks = [...root.querySelectorAll("svg[data-hue]")].filter((el) => el.checkVisibility())
  return {
    tokens: tints.size,
    avatars: avatars.length,
    avatarsFromTokens: avatars.filter((el) => tints.has(getComputedStyle(el).backgroundColor)).length,
    marks: marks.length,
    marksFromTokens: marks.filter((el) => strong.has(getComputedStyle(el).fill)).length,
    images: root.querySelectorAll("img").length,
  }
}

async function runOnce(browser, run, storage) {
  const steps = []
  const ctx = await demoContext(browser, { base: BASE })
  const guard = ctx.__guard
  // The two writes these steps make, answered here.
  fakeWrite(ctx, "POST", /\/po\/createPost$/, (body) => ({ msg: "ok", data: { uuid: `f1e0${Date.now().toString(16).padStart(28, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5"), post_created_at: new Date().toISOString() } }))
  fakeWrite(ctx, "POST", /\/task\/(moveTask|updateTaskStatus|updateTaskDesc|updateTaskPosition|reorderTask)/, () => ({ msg: "ok" }))
  // Long conversations for the scrolling and long-thread steps.
  await longChannel(ctx, storage.generalId, { total: 400, page: 50 })
  await manyMembers(ctx, storage.engineeringId, { total: 200 })
  if (storage.threadPostId) await longThread(ctx, storage.threadPostId, { total: 150 })

  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  // The input a step's "ready" is timed from: the last pointer or key down.
  await page.addInitScript(() => {
    const at = () => (window.__fluInputAt = performance.now())
    addEventListener("pointerdown", at, true)
    addEventListener("keydown", at, true)
  })
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)))

  async function step(n, name, act, ready, { settle = 700, typed = 0, prep } = {}) {
    if (!want(n)) return
    // Set-up that isn't part of what's measured.
    if (prep) await prep().catch((e) => console.log(`  [run ${run}] prep for ${name} failed: ${String(e?.message || e).split("\n")[0]}`))
    const before = await mark(page).catch(() => null)
    const js0 = guard.scriptGzip
    const blocked0 = guard.blocked.length
    const wall = Date.now()
    let ok = true
    let readyMs = null
    let error
    try {
      await act()
      readyMs = ready ? await ready() : null
    } catch (e) {
      ok = false
      error = String(e?.message || e).split("\n")[0].slice(0, 200)
    }
    const wallMs = Date.now() - wall
    await page.waitForTimeout(settle)
    const m = before ? await since(page, before).catch(() => null) : null
    const row = {
      n,
      step: name,
      ok,
      error,
      ready: readyMs,
      wall: wallMs,
      inp: m?.inp ?? null,
      inpName: m?.inpName,
      inpDelay: m?.inpDelay,
      inpWork: m?.inpWork,
      longTasks: m?.longTasks ?? null,
      longMs: m?.longMs ?? null,
      tbt: m?.tbt ?? null,
      cls: m?.cls ?? null,
      jsKB: Math.round((guard.scriptGzip - js0) / 1024),
      commits: m?.commits ?? null,
      renders: m?.renders ?? null,
      maxCommitRenders: m?.maxCommitRenders ?? null,
      top: m?.top,
      topApp: m?.topApp,
      origins: m?.origins,
      slowest: m?.slowest,
      motion: m?.motion,
      loafTop: m?.loafTop,
      shifts: m?.shifts?.filter((s) => s.v > 0.001).slice(0, 4),
      blocked: guard.blocked.slice(blocked0),
    }
    if (typed && m) {
      row.keys = keyStats(m, typed)
      row.rendersPerKey = Math.round((m.renders / typed) * 10) / 10
      row.commitsPerKey = Math.round((m.commits / typed) * 10) / 10
    }
    steps.push(row)
    const tag = ok ? "ok " : "ERR"
    console.log(`  [run ${run}] ${tag} ${String(n).padStart(2)} ${name}: ready ${readyMs ?? "-"} ms, inp ${row.inp}, long ${row.longMs} ms, cls ${row.cls}, js ${row.jsKB} KB, renders ${row.renders}${row.keys ? `, keys p50 ${row.keys.p50} p95 ${row.keys.p95} max ${row.keys.max}` : ""}${row.motion?.layout?.length ? `, LAYOUT MOTION ${row.motion.layout.slice(0, 3).join("; ")}` : ""}${error ? `: ${error}` : ""}`)
    if (SHOTS) await page.screenshot({ path: join(OUT, `${LABEL}-r${run}-${String(n).padStart(2, "0")}-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {})
  }

  const clickLink = (name) => page.getByRole("link", { name }).first().click()
  // Out of the way between steps: the demo's lead prompt (it appears after a
  // send) and whatever the right panel holds.
  const tidy = async () => {
    await page.locator('[aria-label="Run this on your own server"] button[aria-label="Dismiss"]').click({ timeout: 800 }).catch(() => {})
    await page.locator('[data-right-panel] button[aria-label="Close panel"]').first().click({ timeout: 800 }).catch(() => {})
  }
  const composer = () => page.locator('main [contenteditable="true"], #main-content [contenteditable="true"], [data-split-view="-1"] [contenteditable="true"]').last()

  // 1. Open the app: a new visitor, from the demo link to Home's greeting.
  await step(
    1,
    "open the app",
    async () => {
      await page.goto(FE + "/?start_demo=1")
      await page.waitForURL(/\/app\//, { timeout: 90000 })
    },
    () => readyWhen(page, shows, { text: "Good " }, 60000).then(async () => Math.round(await page.evaluate(() => performance.now()))),
    { settle: 1500 },
  )
  await page.getByRole("button", { name: /^(Got it|Dismiss)$/ }).first().click({ timeout: 1500 }).catch(() => {})

  // 2. Switch channel: open one, switch to another, come back (cached).
  await step(2, "open a channel", () => clickLink(DEMO.engineering), () => readyWhen(page, shows, { text: DEMO.engineeringText, path: "/app/channel/" }))
  await step(2.1, "switch channel", () => clickLink(DEMO.design), () => readyWhen(page, shows, { text: DEMO.designText, path: "/app/channel/" }))
  await step(2.2, "switch back", () => clickLink(DEMO.engineering), () => readyWhen(page, shows, { text: DEMO.engineeringText, path: "/app/channel/" }))

  // 3. Type in a composer: short, then with a long message already in it.
  const sentence = "Shipping the release notes this afternoon, then the load test numbers. "
  await step(
    3,
    "type in a composer",
    async () => {
      await composer().click()
      await page.keyboard.type(sentence, { delay: 45 })
    },
    null,
    { typed: sentence.length },
  )
  await step(
    3.1,
    "type, long message",
    () => page.keyboard.type(sentence, { delay: 45 }),
    null,
    {
      typed: sentence.length,
      // A long draft first (not measured), then the same sentence typed after it.
      prep: async () => {
        await composer().click()
        await page.keyboard.insertText(sentence.repeat(25))
        await page.waitForTimeout(1200)
      },
    },
  )
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Backspace")
  await page.waitForTimeout(400)

  // 4. Send, with the POST answered here.
  const token = `Fluidity check ${run}-${Date.now() % 100000}`
  await step(
    4,
    "send",
    async () => {
      await composer().click()
      await page.keyboard.insertText(token)
      await page.waitForTimeout(500)
      await page.keyboard.press("Enter")
    },
    () => readyWhen(page, shows, { text: token, within: "[data-split-view='-1']" }),
  )

  await tidy()

  // 5. Open a thread (150 replies), then type under it.
  await step(5, "open a thread", () => page.getByText(/^\d+ repl(y|ies)$/).last().click(), () => readyWhen(page, exists, { sel: "[data-right-panel] [contenteditable='true']" }), { settle: 1200 })
  await step(
    5.1,
    "type in a long thread",
    async () => {
      await page.locator("[data-right-panel] [contenteditable='true']").last().click()
      await page.keyboard.type(sentence, { delay: 45 })
    },
    null,
    { typed: sentence.length },
  )
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Backspace")
  await page.keyboard.press("Escape")

  // 6. Open a task from the project list.
  await step(6, "open a project", () => clickLink(DEMO.project), () => readyWhen(page, shows, { text: DEMO.task, path: "/app/project/" }))
  await step(6.1, "open a task", () => page.getByText(DEMO.task, { exact: true }).first().click(), () => readyWhen(page, shows, { text: "Description", within: "[data-right-panel]" }), { settle: 1000 })

  // 7. Type in the task's description (or a new task's, where this one isn't editable).
  await step(
    7,
    "type in a task description",
    async () => {
      const desc = page.locator("[data-right-panel] .grid:has(> label:text-is('Description')) [contenteditable='true']")
      if (await desc.count()) {
        await desc.first().click()
      } else {
        await page.keyboard.press("Escape")
        await page.getByRole("button", { name: "Create task" }).first().click()
        await page.locator("[role=dialog] [contenteditable='true']").first().click()
      }
      await page.keyboard.type(sentence, { delay: 45 })
    },
    null,
    { typed: sentence.length },
  )
  await page.keyboard.press("Escape")
  await page.keyboard.press("Escape")
  await tidy()
  await page.waitForTimeout(300)

  // 8. Switch project tabs.
  await step(8, "project tab: board", () => page.getByRole("tab", { name: "Board" }).click(), () => readyWhen(page, shows, { text: "In progress", within: "[data-split-view='-1']" }))
  // 9. Drag a card to another column (answered here).
  await step(
    9,
    "drag on the board",
    async () => {
      const card = page.getByText(DEMO.task, { exact: true }).first()
      const box = await card.boundingBox()
      const target = await page.getByText("In progress", { exact: true }).first().boundingBox()
      if (!box || !target) throw new Error("board not laid out")
      await page.mouse.move(box.x + 20, box.y + box.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + ((target.x + 40 - box.x - 20) * i) / 12, box.y + box.height / 2 + ((target.y + 80 - box.y - box.height / 2) * i) / 12, { steps: 2 })
      await page.mouse.up()
    },
    null,
    { settle: 1000 },
  )
  await step(8.1, "project tab: timeline", () => page.getByRole("tab", { name: "Timeline" }).click(), () => readyWhen(page, exists, { sel: "[data-split-view='-1'] [role='tabpanel'], [data-split-view='-1'] svg" }))
  await step(8.2, "project tab: list", () => page.getByRole("tab", { name: "List" }).click(), () => readyWhen(page, shows, { text: DEMO.task, within: "[data-split-view='-1']" }))

  // 10. Open search and type.
  await step(
    10,
    "search and type",
    async () => {
      await page.getByPlaceholder(/Search messages, docs and tasks/).first().click()
      await page.keyboard.type("launch plan", { delay: 90 })
    },
    () => readyWhen(page, shows, { text: DEMO.doc, within: "[data-radix-popper-content-wrapper]" }),
    { typed: "launch plan".length },
  )
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Clear search" }).click({ timeout: 800 }).catch(() => {})
  await page.keyboard.press("Escape")

  // 11. Open a doc and type in it (edits never leave the browser).
  await step(11, "open a doc", () => clickLink(DEMO.doc), () => readyWhen(page, shows, { text: DEMO.docText, path: "/app/doc/" }), { settle: 1500 })
  await step(
    11.1,
    "type in a doc",
    async () => {
      const body = page.getByText(DEMO.docText).first()
      await body.click()
      await page.keyboard.press("End")
      await page.keyboard.type(" " + sentence, { delay: 45 })
    },
    null,
    { typed: sentence.length + 1 },
  )

  // 12. Open the calendar.
  await step(
    12,
    "open the calendar",
    async () => {
      const cal = page.getByRole("link", { name: /^Calendar/ }).first()
      if (!(await cal.isVisible().catch(() => false))) await page.getByRole("button", { name: /^More$/ }).first().click()
      await page.getByRole("link", { name: /^Calendar/ }).first().click()
    },
    () => readyWhen(page, exists, { sel: "[data-split-view='-1'] button[aria-label='Next month'], [data-split-view='-1'] [role='grid']", path: "/app/calendar" }),
  )

  // 13. Open settings, from the avatar menu.
  await step(
    13,
    "open settings",
    async () => {
      await page.getByRole("button", { name: /^SR$/ }).first().click()
      await page.getByRole("menuitem", { name: "Settings" }).click()
    },
    () => readyWhen(page, exists, { sel: "[role='dialog']" }),
    { settle: 1000 },
  )
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)

  // 14. The command palette: open, type, close.
  await step(14, "open the command palette", () => page.keyboard.press("Control+k"), () => readyWhen(page, exists, { sel: "[cmdk-input]" }))
  await step(14.1, "type in the palette", () => page.keyboard.type("engin", { delay: 90 }), null, { typed: 5, settle: 1200 })
  await page.keyboard.press("Escape")

  // 15. Scroll a long channel (400 messages, older ones paged in as it goes).
  await step(15, "open a long channel", () => clickLink(DEMO.general), () => readyWhen(page, shows, { text: "Who is on call Thursday", within: "[data-split-view='-1']", path: "/app/channel/" }), { settle: 1500 })
  await step(
    15.1,
    "scroll a long channel",
    async () => {
      const box = await page.getByText("Who is on call Thursday").first().boundingBox()
      if (!box) throw new Error("no message list")
      await page.mouse.move(box.x + 40, box.y)
      await page.evaluate(() => {
        const f = (window.__fluFrames = [])
        let last = performance.now()
        const tick = (t) => {
          f.push(t - last)
          last = t
          if (f.length < 2000 && window.__fluFrames === f) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, -350)
        await page.waitForTimeout(40)
      }
      await page.waitForTimeout(500)
    },
    null,
    { settle: 300 },
  )
  const frames = await page.evaluate(() => {
    const f = window.__fluFrames || []
    window.__fluFrames = null
    return f
  })
  const channelColours = await page.evaluate(colourAudit, "[data-split-view='-1']").catch(() => null)
  const longRow = steps.find((s) => s.n === 15)
  if (longRow && channelColours) longRow.colours = channelColours
  const last = steps.find((s) => s.n === 15.1)
  if (last && frames.length) {
    last.frames = frames.length
    last.slowFrames = frames.filter((d) => d > 34).length
    last.worstFrame = Math.round(Math.max(...frames))
  }

  // 16. A list of coloured avatars: the channel's members, 200 of them, none
  // with a photo, so each is a camp-hue fallback. Then scroll it.
  await tidy()
  await step(
    16,
    "open a people list",
    async () => {
      await clickLink(DEMO.engineering)
      await readyWhen(page, shows, { text: DEMO.engineeringText, path: "/app/channel/" })
      await page.getByRole("button", { name: "Manage channel members" }).first().click()
    },
    () => readyWhen(page, shows, { text: "Rhea Silva", within: "[role='dialog']" }),
    { settle: 1000 },
  )
  const people = await page.evaluate(colourAudit, "[role='dialog']").catch(() => null)
  const peopleRow = steps.find((s) => s.n === 16)
  if (peopleRow && people) peopleRow.colours = people
  await step(
    16.1,
    "scroll the people list",
    async () => {
      const box = await page.getByText("Rhea Silva").first().boundingBox().catch(() => null)
      const dialog = await page.locator("[role='dialog']").first().boundingBox()
      if (!dialog) throw new Error("no dialog")
      await page.mouse.move(dialog.x + dialog.width / 2, (box?.y ?? dialog.y + dialog.height / 2) - 40)
      await page.evaluate(() => {
        const f = (window.__fluFrames = [])
        let last = performance.now()
        const tick = (t) => {
          f.push(t - last)
          last = t
          if (f.length < 2000 && window.__fluFrames === f) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, i < 10 ? -300 : 300)
        await page.waitForTimeout(40)
      }
      await page.waitForTimeout(300)
    },
    null,
    { settle: 300 },
  )
  const peopleFrames = await page.evaluate(() => {
    const f = window.__fluFrames || []
    window.__fluFrames = null
    return f
  })
  const scrollRow = steps.find((s) => s.n === 16.1)
  if (scrollRow && peopleFrames.length) {
    scrollRow.frames = peopleFrames.length
    scrollRow.slowFrames = peopleFrames.filter((d) => d > 34).length
    scrollRow.worstFrame = Math.round(Math.max(...peopleFrames))
  }
  await page.keyboard.press("Escape")

  const blocked = [...new Set(guard.blocked)]
  await ctx.close()
  return { steps, blocked, faked: [...new Set(guard.faked)], droppedFrames: guard.droppedFrames, errors: [...new Set(errors)] }
}

// The ids the long-conversation steps need, from a first signed-in look.
async function discover(browser) {
  const ctx = await demoContext(browser, { base: BASE })
  const page = await ctx.newPage()
  await enterDemo(page)
  await page.getByText(/Good (morning|afternoon|evening)/).first().waitFor({ timeout: 60000 })
  const hrefOf = async (name) => (await page.getByRole("link", { name }).first().getAttribute("href")) || ""
  const generalId = (await hrefOf(DEMO.general)).split("/").pop()
  const engineeringId = (await hrefOf(DEMO.engineering)).split("/").pop()
  let threadPostId = ""
  const seen = (r) => {
    const m = r.url().match(/\/po\/allComments\/([0-9a-f-]{36})/)
    if (m) threadPostId = m[1]
  }
  page.on("request", seen)
  await page.getByRole("link", { name: DEMO.engineering }).first().click()
  await page.getByText(/^\d+ repl(y|ies)$/).last().click()
  await page.waitForTimeout(2500)
  const state = await ctx.storageState()
  await ctx.close()
  return { generalId, engineeringId, threadPostId, state }
}

// What each route downloads, loaded cold (a signed-in visitor, empty cache).
async function routeWeights(browser, storage) {
  const routes = ["/app/home", `/app/channel/${storage.generalId}`, "/app/chat", "/app/myTask", "/app/project", "/app/doc", "/app/calendar", "/app/search", "/app/activity", "/app/settings", "/app/inbox", "/app/later", "/app/tables", "/app/goals", "/app/board"]
  const out = []
  for (const r of routes) {
    const ctx = await demoContext(browser, { base: BASE, storageState: storage.state })
    const page = await ctx.newPage()
    await page.goto(FE + r, { waitUntil: "load" }).catch(() => {})
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {})
    await page.waitForTimeout(1000)
    const g = ctx.__guard
    out.push({ route: r.replace(storage.generalId, ":id"), scripts: g.scripts.length, kb: Math.round(g.scriptBytes / 1024), gzipKB: Math.round(g.scriptGzip / 1024) })
    console.log(`  route ${r}: ${g.scripts.length} scripts, ${Math.round(g.scriptGzip / 1024)} KB gzip (${Math.round(g.scriptBytes / 1024)} KB)`)
    await ctx.close()
  }
  return out
}

const browser = await launch()
console.log(`fluidity: ${LABEL}, ${BASE}, cpu ${CPU}x, ${RUNS} run(s)`)
const storage = await discover(browser)
const runs = []
for (let r = 1; r <= RUNS; r++) runs.push(await runOnce(browser, r, storage))
const routes = ROUTES ? await routeWeights(browser, storage) : null
await browser.close()

// Medians across runs, step by step.
const names = [...new Map(runs.flatMap((r) => r.steps.map((s) => [s.n, s.step]))).entries()].sort((a, b) => a[0] - b[0])
const fields = ["ready", "inp", "longMs", "tbt", "cls", "jsKB", "commits", "renders"]
const table = names.map(([n, step]) => {
  const rows = runs.map((r) => r.steps.find((s) => s.n === n)).filter(Boolean)
  const row = { n, step, ok: `${rows.filter((s) => s.ok).length}/${rows.length}` }
  for (const f of fields) row[f] = median(rows.map((s) => s[f]))
  const keyed = rows.filter((s) => s.keys)
  if (keyed.length) {
    row.keyP50 = median(keyed.map((s) => s.keys.p50))
    row.keyP95 = median(keyed.map((s) => s.keys.p95))
    row.keyMax = median(keyed.map((s) => s.keys.max))
    row.rendersPerKey = median(keyed.map((s) => s.rendersPerKey))
  }
  const scrolled = rows.filter((s) => s.frames)
  if (scrolled.length) {
    row.slowFrames = median(scrolled.map((s) => s.slowFrames))
    row.worstFrame = median(scrolled.map((s) => s.worstFrame))
  }
  return row
})
const result = { label: LABEL, base: BASE, cpu: CPU, runs: RUNS, at: new Date().toISOString(), table, routes, raw: runs }
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify(result, null, 1))

const md = [
  `| # | step | ok | ready ms | INP ms | key p50/p95/max | renders/key | long ms | TBT | CLS | JS KB | commits | renders |`,
  `|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ...table.map(
    (r) =>
      `| ${r.n} | ${r.step} | ${r.ok} | ${r.ready ?? "-"} | ${r.inp ?? "-"} | ${r.keyP50 != null ? `${r.keyP50}/${r.keyP95}/${r.keyMax}` : "-"} | ${r.rendersPerKey ?? "-"} | ${r.longMs ?? "-"} | ${r.tbt ?? "-"} | ${r.cls ?? "-"} | ${r.jsKB ?? "-"} | ${r.commits ?? "-"} | ${r.renders ?? "-"}${r.slowFrames != null ? ` (slow frames ${r.slowFrames}, worst ${r.worstFrame} ms)` : ""} |`,
  ),
].join("\n")
writeFileSync(join(OUT, `${LABEL}.md`), md + "\n")
console.log("\n" + md)
console.log(`\nblocked writes: ${[...new Set(runs.flatMap((r) => r.blocked))].join(", ") || "none"}`)
console.log(`answered here: ${[...new Set(runs.flatMap((r) => r.faked))].join(", ") || "none"}`)
console.log(`socket frames dropped: ${runs.reduce((a, r) => a + r.droppedFrames, 0)}`)
for (const r of runs)
  for (const s of r.steps.filter((s) => s.colours))
    console.log(`colour, ${s.step}: ${s.colours.avatars} avatars (${s.colours.avatarsFromTokens} from camp tokens), ${s.colours.marks} identity marks (${s.colours.marksFromTokens} from tokens), ${s.colours.images} images`)
const errs = [...new Set(runs.flatMap((r) => r.errors))]
if (errs.length) console.log(`page errors: ${errs.join(" | ")}`)
