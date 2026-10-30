#!/usr/bin/env node
// Every main surface's fluidity, measured the same way on a production build
// against the fake server side (fakeApp.mjs, the workspace in workspace.mjs):
// how long until the useful content shows, the worst input (event timing, as
// INP is computed), long tasks, frame time while a scroll or drag runs, React
// renders per interaction, layout shift, blank frames and bytes on the wire.
// FLUIDITY-LEAD, 20 Oct 2026 (package 19; design/WIN-ALL-ROWS.md "fluidity").
//
// Each surface group lives in surfaces/<group>.mjs and registers its own
// budgets file in scenarios.json; this file is the one harness they share.
//
//   pnpm build && pnpm next start -p 3171
//   node scripts/fluidity/surfaces.mjs --base http://localhost:3171 --only work --cpu 1
//   node scripts/fluidity/surfaces.mjs --base http://localhost:3171 --only work --cpu 4   # a mid phone
//   options: --runs 5  --rtt 150  --device desktop|phone (default: desktop at 1x, phone above)
//            --phone-scroll wheel (a phone's scroll by the wheel, to tell the input
//            from the page; otherwise a phone's scroll is a finger's: fingerScroll)
//            --selector-stats listScroll,taskPanel (CSS selector stats over these
//            steps: a diagnosis, since the trace slows style work; their times don't count)
//            --waterfall settingsOpen (every request these steps made, from the
//            input to the settle's end, with its start and end: what a step waits on)
//            --names queryWrite (every component that rendered in these steps, and
//            every origin, not just the top 8, and the first three commits'
//            components: name them on a profiling build)
//            --trace calEventOpen (the step's longest task taken apart: the
//            layouts and style recalculations a script forced in it, with the
//            stack that forced each, and its script calls by time; a diagnosis
//            on a build with names kept, as the trace slows the step)
//            --steps listOpen,boardDrag (just these steps)  --budgets <file>
//            --out <file.json> (every run's rows)  --result <file> (budget rows, for run.mjs)
// Under Docker network churn, in its own namespace, in the light lane:
//   release-1011/tools/heavy.sh --light ~/bin/browser-isolated --forward 3171 -- node scripts/fluidity/surfaces.mjs ...
//
// Every run records the host's load average before and after; a run above
// load 16 is flagged in the output (BUSY), and its times are read with that.
import { chromium } from "@playwright/test"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { check } from "./budgets.mjs"
import { USERS, fakeApp } from "./fakeApp.mjs"
import { resetWorkspace } from "./workspace.mjs"
import { BUSY_LOAD, addNet, cpuState, cpusAllowed, fingerScroll, forcedWork, hostLoad, installProbe, keyStats, mark, median, netBytes, p95, scriptsTwice, scrollGesture, selectorStats, since, startFrames, stopFrames, touchDrag, traceEvents } from "./lib.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`)
  return i < 0 ? d : args[i + 1]
}
const BASE = opt("base", "http://localhost:3171")
const CPU = Number(opt("cpu", 1))
const RUNS = Number(opt("runs", 5))
const RTT = Number(opt("rtt", 150))
const DEVICE = opt("device", CPU > 1 ? "phone" : "desktop")
const PHONE = DEVICE === "phone"
const ONLY = String(opt("only", "")).split(",").filter(Boolean)
const STEPS = opt("steps", "") ? new Set(String(opt("steps")).split(",")) : null
const OUT = opt("out", null)
// A phone's scroll is a finger's, unless asked for by the wheel (diagnosis only).
const PHONE_WHEEL = PHONE && opt("phone-scroll", "touch") === "wheel"
const SELECTOR_STATS = new Set(String(opt("selector-stats", "")).split(",").filter(Boolean))
// Diagnoses (FLUIDITY-LEAD-4, 21 Oct 2026): a step's requests with their times
// (what it waits on), and every component that rendered in it, by name.
const WATERFALL = new Set(String(opt("waterfall", "")).split(",").filter(Boolean))
const NAMES = new Set(String(opt("names", "")).split(",").filter(Boolean))
// What a step's longest task was made of (FLUIDITY-LEAD-5, 21 Oct 2026).
const TRACE = new Set(String(opt("trace", "")).split(",").filter(Boolean))
// The step's CPU, sampled over all of it (WHITEBOARD-LEAD-22, miro-06's drag): self time by script and the top
// functions, so a drag's frames split into Excalidraw's work, React's and ours. A diagnosis: the profiler slows
// the step, so its times don't count.
const PROFILE = new Set(String(opt("profile", "")).split(",").filter(Boolean))
// A screenshot of every step that failed, and the API calls each run made, into this folder.
const SHOTS = opt("shots", null)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/** A CPU profile's self time, in ms: in all, by script (a chunk's path), and its 25 busiest functions. */
function cpuSplit(p) {
  const self = new Map()
  for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0) / 1000)
  const short = (url) => (url ? url.replace(/^.*\/_next\/static\//, "").replace(/^https?:\/\/[^/]+/, "") : "")
  const byUrl = new Map()
  const byFn = new Map()
  let total = 0
  for (const n of p.nodes) {
    const ms = self.get(n.id) ?? 0
    if (!ms) continue
    total += ms
    const f = n.callFrame
    const where = short(f.url) || f.functionName || "(native)"
    byUrl.set(where, (byUrl.get(where) ?? 0) + ms)
    const fn = `${f.functionName || "(anonymous)"} ${short(f.url)}:${f.lineNumber + 1}:${f.columnNumber + 1}`
    byFn.set(fn, (byFn.get(fn) ?? 0) + ms)
  }
  const top = (m, k) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, ms]) => [name, Math.round(ms * 10) / 10])
  // Who calls the busiest functions: each one's self time, by the chain of its first three callers that aren't itself
  // (a recursive copy's time goes to whoever started it).
  const parent = new Map()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const byId = new Map(p.nodes.map((n) => [n.id, n]))
  const name = (n) => `${n.callFrame.functionName || "(anonymous)"} ${short(n.callFrame.url)}:${n.callFrame.lineNumber + 1}:${n.callFrame.columnNumber + 1}`
  const busiest = new Set(top(byFn, 8).map(([f]) => f))
  const callers = new Map()
  for (const n of p.nodes) {
    const ms = self.get(n.id) ?? 0
    const fn = name(n)
    if (!ms || !busiest.has(fn)) continue
    const chain = []
    let up = parent.get(n.id)
    while (up !== undefined && chain.length < 3) {
      const u = byId.get(up)
      if (name(u) !== fn) chain.push(name(u))
      up = parent.get(up)
    }
    const key = `${fn} <- ${chain.join(" <- ")}`
    callers.set(key, (callers.get(key) ?? 0) + ms)
  }
  return { totalMs: Math.round(total), byScript: top(byUrl, 14), functions: top(byFn, 25), callers: top(callers, 24) }
}

const GROUPS = {}
for (const name of ONLY) GROUPS[name] = (await import(join(here, "surfaces", `${name}.mjs`))).default
if (!ONLY.length) {
  console.error("usage: surfaces.mjs --only <group>[,<group>] (a file in scripts/fluidity/surfaces/)")
  process.exit(2)
}
const BUDGETS = JSON.parse(readFileSync(opt("budgets", join(here, `${ONLY[0]}-budgets.json`)), "utf8"))

const phoneOpts = {
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
}
const viewport = PHONE ? { width: 390, height: 844 } : { width: 1440, height: 900 }
// The collaboration server is asked for only by docs (docs.mjs has its own); fakeApp wants one.
const NO_COLLAB = { connect: () => ({ receive() {}, closed() {} }) }

// ---- in the page: the input a step is timed from, and blank frames ----
function inPage() {
  const at = () => (window.__fluInputAt = performance.now())
  addEventListener("pointerdown", at, true)
  addEventListener("keydown", at, true)
  addEventListener("touchstart", at, true)
  // Frames in which the region a step opens shows nothing at all: no text, no
  // skeleton, no image. A skeleton or the old content is not blank.
  // (lib.mjs's frameWatch counts them: hits are the blank frames.)
  window.__fluBlankWatch = (sel) => {
    window.__fluBlank = window.__flu.frameWatch(() => {
      const el = document.querySelector(sel)
      return !(el && el.getClientRects().length > 0 && ((el.innerText || "").trim().length > 0 || el.querySelector("img, svg, canvas, [data-skeleton], .animate-pulse, [aria-busy='true']")))
    })
  }
}

// ---- the harness one group's run gets ----
function harness(page, context, cdp, net, log) {
  const h = {
    page,
    context,
    cdp,
    phone: PHONE,
    cpu: CPU,
    base: BASE,
    log,
    rows: [],
    /** Whether a step is wanted (--steps). */
    wants: (id) => !STEPS || STEPS.has(id),
    /** A fresh navigation in this tab, timed from its start. */
    async goto(path) {
      await page.goto(BASE + path, { waitUntil: "commit", timeout: 120000 })
    },
    /** A client-side navigation, as a link does it, timed from the call. */
    async push(path) {
      await page.evaluate((p) => {
        window.__fluInputAt = performance.now()
        window.next.router.push(p)
      }, path)
    },
    /**
     * Waits, frame by frame, until `cond` holds in the page, and returns the
     * ms since the step's input (or since the navigation began, for a cold open).
     * cond: { sel, text, re, min, path, gone } — `sel` visible (holding `text`,
     * or matching the regexp source `re`, in its text or an input's value; `min`
     * of them), the address holding `path`, `gone` no longer in the page.
     */
    async ready(cond, { timeout = 30000, fromNav = false } = {}) {
      const handle = await page.waitForFunction(
        ({ c, fromNav }) => {
          if (c.path && !location.pathname.includes(c.path)) return false
          if (c.gone && document.querySelector(c.gone)) return false
          if (c.sel) {
            const said = (el) => ("value" in el && typeof el.value === "string" && el.value ? el.value : el.textContent) || ""
            const all = [...document.querySelectorAll(c.sel)].filter((el) => el.getClientRects().length > 0 && (!c.text || said(el).includes(c.text)) && (!c.re || new RegExp(c.re).test(said(el))))
            if (all.length < (c.min || 1)) return false
          }
          const t0 = fromNav ? 0 : (window.__fluInputAt ?? 0)
          return Math.max(0, performance.now() - t0)
        },
        { c: cond, fromNav },
        { polling: "raf", timeout },
      )
      return Math.round(await handle.jsonValue())
    },
    /**
     * Waits, frame by frame, until `fn(arg)` (run in the page) is true, and
     * returns the ms since the step's input: for what a selector can't say
     * ("more rows than before").
     */
    async until(fn, arg, { timeout = 30000 } = {}) {
      const handle = await page.waitForFunction(
        ({ src, arg }) => {
          const ok = new Function("arg", `return (${src})(arg)`)(arg)
          return ok ? Math.max(0, performance.now() - (window.__fluInputAt ?? 0)) : false
        },
        { src: fn.toString(), arg },
        { polling: "raf", timeout },
      )
      return Math.round(await handle.jsonValue())
    },
    /**
     * Goes somewhere the way a person does: on a computer the pointer rests
     * on the link (150 ms, what a sidebar link prefetches on: IntentLink) and
     * clicks; on a phone a tap. The step is timed from the press.
     */
    async visit(locator, fallbackPath = null) {
      // A place this layout keeps out of sight (a phone's tab bar has no link
      // to it) is reached the way its own control would: the router.
      if (!(await locator.isVisible().catch(() => false))) {
        const href = fallbackPath ?? (await locator.getAttribute("href").catch(() => null))
        if (!href) throw new Error("no link to follow")
        return h.push(href)
      }
      if (!PHONE) {
        await locator.hover({ timeout: 15000 })
        await page.waitForTimeout(150)
      }
      await h.press(locator)
    },
    /** A click on a computer, a tap on a phone. */
    async press(locator) {
      if (PHONE) await locator.tap({ timeout: 15000 })
      else await locator.click({ timeout: 15000 })
    },
    /**
     * The element that scrolls `locator` (its nearest scrolling ancestor, or
     * the page's), marked so a gesture can start on it: a computer's list and
     * a phone's scroll in different boxes.
     */
    async scrollerOf(locator) {
      await locator.first().evaluate((el) => {
        document.querySelectorAll("[data-flu-scroller]").forEach((x) => x.removeAttribute("data-flu-scroller"))
        let s = el.parentElement
        while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement
        ;(s ?? document.scrollingElement ?? document.body).setAttribute("data-flu-scroller", "")
      })
      return page.locator("[data-flu-scroller]").first()
    },
    /**
     * Scrolls the element under `locator` by dy (down is positive): a wheel
     * on a computer, a finger on a phone (fingerScroll: strokes inside the
     * part on screen). A scroll that moves nothing fails the step.
     */
    async scroll(locator, { dy = 0, dx = 0, speed = PHONE ? 1200 : 2000, repeat = 0 } = {}) {
      const box = await locator.boundingBox()
      if (!box) throw new Error("nothing to scroll")
      // The gesture starts inside the part of the element that is on screen.
      const vp = page.viewportSize()
      const left = Math.max(box.x, 0)
      const top = Math.max(box.y, 0)
      const right = Math.min(box.x + box.width, vp.width)
      const bottom = Math.min(box.y + box.height, vp.height)
      if (right - left < 4 || bottom - top < 4) throw new Error("the element to scroll is off screen")
      const at = () => locator.evaluate((el) => [el.scrollLeft, el.scrollTop]).catch(() => [0, 0])
      const point = { x: (left + right) / 2, y: top + Math.min((bottom - top) / 2, 300) }
      const [x0, y0] = await at()
      const finger = PHONE && !PHONE_WHEEL
      h.scrollInput = finger ? "touch" : "wheel"
      if (finger) for (let i = 0; i <= repeat; i++) await fingerScroll(cdp, { box: { left, top, right, bottom }, dx, dy, speed })
      else await scrollGesture(cdp, { ...point, dx: -dx, dy: -dy, speed, repeat })
      const [x1, y1] = await at()
      // A gesture that moved nothing measured nothing: the step says so.
      h.scrolledPx = (h.scrolledPx ?? 0) + Math.abs(x1 - x0) + Math.abs(y1 - y0)
      if (x1 === x0 && y1 === y0) throw new Error(`the ${finger ? "finger's" : "wheel's"} scroll moved nothing (${dx ? `dx ${dx}` : `dy ${dy}`}, at ${x0},${y0})`)
    },
    /** Drags `from` onto `to` with the pointer, or the finger after a hold on a phone. */
    async drag(from, to, { steps = 16 } = {}) {
      const a = await from.boundingBox()
      const b = await to.boundingBox()
      if (!a || !b) throw new Error("nothing to drag")
      const p = { x: a.x + a.width / 2, y: a.y + Math.min(a.height / 2, 20) }
      const q = { x: b.x + b.width / 2, y: b.y + Math.min(b.height / 2, 40) }
      if (PHONE) return touchDrag(cdp, p, q, { steps, holdMs: 400 })
      await page.mouse.move(p.x, p.y)
      await page.mouse.down()
      for (let i = 1; i <= steps; i++) {
        await page.mouse.move(p.x + ((q.x - p.x) * i) / steps, p.y + ((q.y - p.y) * i) / steps)
        await page.waitForTimeout(16)
      }
      await page.mouse.up()
    },
    /**
     * One measured step. act() gives the input; ready(), when given, waits
     * for the useful content and returns its ms. frames: sample frame time
     * while act runs, until ready; or, as { from: "ready", ms }, for ms after
     * the content is ready (an overlay's entry: what moves on screen, apart
     * from the wait before it, which ready and INP already time). blank: the
     * region whose empty frames count. typed: keys typed, for per-key latency.
     */
    async step(id, { act, ready, frames = false, blank = null, settle = 600, typed = 0, nav = false }) {
      if (!h.wants(id)) return null
      // A step that loads a new document (nav) counts from that document's
      // start: the page's buffers begin again with it.
      const before = nav ? { t: 0, commits: 0, renders: 0, byName: {}, selfMs: {}, origins: {} } : await mark(page)
      const perf = async () => Object.fromEntries(((await cdp.send("Performance.getMetrics").catch(() => null))?.metrics ?? []).map((x) => [x.name, x.value]))
      const perf0 = await perf()
      net.take()
      // A new document starts with nothing cached: its scripts count again.
      if (nav) net.cold()
      if (!nav) await page.evaluate(() => (window.__fluInputAt = performance.now()))
      if (blank && !nav) await page.evaluate((s) => window.__fluBlankWatch(s), blank)
      h.scrolledPx = 0
      h.scrollInput = PHONE && !PHONE_WHEEL ? "touch" : "wheel"
      const entryMs = frames?.from === "ready" ? (frames.ms ?? 500) : 0
      if (frames && !entryMs) await startFrames(page)
      let readyMs = null
      let error
      let selectors
      let trace
      let profile
      if (NAMES.has(id)) await page.evaluate(() => (window.__fluCommitNames = true))
      // The bytes until the content is useful, apart from the settle's after
      // it (what a page warms once it is quiet): netReady and netWarm.
      let netReady = null
      const run = async () => {
        await act()
        readyMs = ready ? await ready() : null
        if (ready) netReady = net.take()
        if (entryMs) {
          await startFrames(page)
          await page.waitForTimeout(entryMs)
        }
      }
      try {
        if (SELECTOR_STATS.has(id)) selectors = await selectorStats(cdp, run)
        else if (TRACE.has(id)) {
          const events = await traceEvents(
            cdp,
            async () => {
              await page.evaluate(() => performance.mark("flu-step"))
              await run()
            },
            { stacks: true },
          )
          trace = forcedWork(events, "flu-step")
        } else if (PROFILE.has(id)) {
          await cdp.send("Profiler.enable")
          await cdp.send("Profiler.setSamplingInterval", { interval: 250 })
          await cdp.send("Profiler.start")
          try {
            await run()
          } finally {
            profile = cpuSplit((await cdp.send("Profiler.stop")).profile)
          }
        } else await run()
      } catch (e) {
        error = String(e?.message || e).split("\n")[0].slice(0, 200)
      }
      if (NAMES.has(id)) await page.evaluate(() => (window.__fluCommitNames = false)).catch(() => {})
      const f = frames ? await stopFrames(page).catch(() => null) : null
      if (blank) await page.evaluate(() => window.__fluBlank && (window.__fluBlank.done = true)).catch(() => {})
      await page.waitForTimeout(settle)
      const m = await since(page, before).catch(() => null)
      const perf1 = await perf()
      const delta = (k) => (perf1[k] != null && perf0[k] != null ? Math.round((perf1[k] - perf0[k]) * (k.endsWith("Duration") ? 1000 : 1)) : null)
      const b = blank ? await page.evaluate(() => window.__fluBlank).catch(() => null) : null
      const row = {
        id,
        ok: !error,
        error,
        ready: readyMs,
        inp: m?.inp ?? null,
        inpName: m?.inpName,
        longMs: m?.longMs ?? null,
        tbt: m?.tbt ?? null,
        cls: m?.cls ?? null,
        renders: m?.renders ?? null,
        // Of those, the renders inside a library's own tree (window.__fluInsideProp: a whiteboard's canvas).
        rendersInside: m?.rendersInside || undefined,
        commits: m?.commits ?? null,
        frames: f,
        scrolledPx: frames ? h.scrolledPx : undefined,
        // Layouts and style recalculations the renderer ran, and their ms.
        layouts: delta("LayoutCount"),
        styleRecalcs: delta("RecalcStyleCount"),
        layoutMs: delta("LayoutDuration"),
        styleMs: delta("RecalcStyleDuration"),
        scrollInput: frames && h.scrolledPx ? h.scrollInput : undefined,
        blankFrames: b ? b.hits : null,
        ...((rest) => (netReady ? { net: addNet(netReady, rest), netReady, netWarm: rest } : { net: rest }))(net.take()),
        // Script elements put in again for an address the document had: a
        // real browser takes each from its cache and runs it again.
        scriptsTwice: scriptsTwice(m?.scriptsAgain, net.bytesOf),
        origins: m?.origins?.slice(0, 8),
        topApp: m?.topApp?.slice(0, 8),
        // ms per component, in a profiling build only (next build --profile).
        slowest: m?.slowest?.slice(0, 8),
        loafTop: m?.loafTop,
        // The longest frames whole, and the ResizeObservers alive at the step's end.
        loafWorst: m?.loafWorst,
        ro: m?.ro,
        // CSS selector stats (--selector-stats): a diagnosis; this step's times don't count.
        selectors,
        // The longest task taken apart (--trace): a diagnosis; this step's times don't count.
        trace,
        // The step's CPU by script and function (--profile): a diagnosis; this step's times don't count.
        profile,
      }
      if (typed && m) {
        const k = keyStats(m, typed)
        row.keyP50 = k.p50
        row.keyP95 = k.p95
        row.rendersPerKey = Math.round((m.renders / typed) * 10) / 10
      }
      if (NAMES.has(id) && m) {
        const byCount = (o) => Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`)
        row.names = { byName: byCount(m.byNameAll), origins: byCount(m.originsAll), commits: m.commitNames }
      }
      // Every request from the step's input (or its document's start) to the
      // settle's end, in ms from that input: when it began and when its answer
      // was in. A cached script shows 0 KB. Resource timing, so a request still
      // open at the end isn't listed.
      if (WATERFALL.has(id)) {
        row.waterfall = await page
          .evaluate((nav) => {
            const t0 = nav ? 0 : (window.__fluInputAt ?? 0)
            return performance
              .getEntriesByType("resource")
              .filter((e) => e.startTime >= t0 - 1)
              .sort((a, b) => a.startTime - b.startTime)
              .map((e) => ({ at: Math.round(e.startTime - t0), end: Math.round(e.responseEnd - t0), kind: e.initiatorType, kb: Math.round(e.transferSize / 102.4) / 10, url: e.name.replace(location.origin, "").replace(/^\/_next\/static\//, "").slice(0, 140) }))
          }, nav)
          .catch((e) => [{ error: String(e?.message || e).slice(0, 120) }])
      }
      h.rows.push(row)
      if (error && SHOTS) await page.screenshot({ path: join(SHOTS, `${id}-${DEVICE}-${CPU}x-${Date.now()}.png`) }).catch(() => {})
      const fr = f ? ` frames p95 ${f.p95} ms, dropped ${f.droppedPct}%${row.scrollInput ? ` (${row.scrollInput}, ${row.scrolledPx} px)` : ""}` : ""
      if (selectors) console.log(`    selectors (a diagnosis: times don't count): ${selectors.totalMs} ms over ${selectors.recalcs} style recalculations; ${selectors.top.slice(0, 6).map((x) => `${x.selector} ${Math.round(x.us / 100) / 10} ms (${x.attempts} tries, ${x.matches} matched)`).join("; ")}`)
      const tw = row.scriptsTwice
      const kb = row.net?.scriptKB ? `, script ${row.netReady ? `${row.netReady.scriptKB}+${row.netWarm.scriptKB}` : row.net.scriptKB} KB${row.net.repeatKB ? ` (${row.net.repeatKB} fetched again)` : ""}${tw ? `, ${tw.runs} run twice (${tw.kb} KB)` : ""}` : ""
      console.log(`  ${row.ok ? "ok " : "ERR"} ${id}: ready ${readyMs ?? "-"} ms, inp ${row.inp}, long ${row.longMs} ms, renders ${row.renders}${fr}${row.keyP95 != null ? `, key p95 ${row.keyP95}` : ""}${b ? `, blank ${b.hits}/${b.frames}` : ""}${kb}${error ? `: ${error}` : ""}`)
      if (trace?.layout) console.log(`      trace: longest task ${trace.taskMs} ms at +${trace.taskAtMs}; layout ${trace.layout.ms} ms (forced ${trace.layout.forcedMs}), style ${trace.style.ms} ms (forced ${trace.style.forcedMs})`)
      return row
    },
  }
  return h
}

// The browser's fake camera and microphone, granted without a prompt: a call's
// green room draws its preview from them.
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] })
async function newPage(group, log) {
  const context = await browser.newContext({ viewport, ...(PHONE ? phoneOpts : {}), serviceWorkers: "block" })
  await installProbe(context)
  await context.addInitScript(inPage)
  // The browser keeps 250 requests' timings unless told otherwise: a waterfall late in a run needs them all.
  if (WATERFALL.size) await context.addInitScript(() => performance.setResourceTimingBufferSize(20000))
  // The first-run keys tip and the demo's prompts would rise mid-step: the
  // tip is seeded as seen, and a group seeds what else it needs (storage).
  await context.addInitScript((seen) => {
    try {
      for (const [k, v] of Object.entries(seen)) localStorage.setItem(k, v)
    } catch {
      /* storage off */
    }
  }, { oc_keys_tip_seen: "1", ...(group.storage ?? {}) })
  // What a group's page needs from its first script: stamps on its socket, a probe's marker.
  for (const s of group.initScripts ?? []) await context.addInitScript(s.fn, s.arg)
  await fakeApp(context, { app: BASE, user: USERS.sam, docs: group.docs ?? [], collab: group.collab ?? NO_COLLAB, rtt: RTT, fixtures: group.fixtures(), log, delays: group.delays, broker: group.broker })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  const net = await netBytes(cdp)
  // The renderer's own counters: layouts and style recalculations per step.
  await cdp.send("Performance.enable").catch(() => {})
  return { context, page, cdp, net }
}

const result = { base: BASE, cpu: CPU, rtt: RTT, device: DEVICE, at: new Date().toISOString(), cpus: cpusAllowed(), runs: [], errors: [] }
console.log(`client on CPUs ${result.cpus}, load ${hostLoad()}`)
for (const [name, group] of Object.entries(GROUPS)) {
  console.log(`surfaces: ${name}, ${DEVICE} at ${CPU}x, rtt ${RTT} ms, ${RUNS} run(s), ${BASE}`)
  for (let r = 0; r < RUNS; r++) {
    const log = []
    // Every run starts from the same workspace: what an earlier run wrote is gone.
    resetWorkspace()
    const loadBefore = hostLoad()
    const cpuBefore = cpuState()
    const { context, page, cdp, net } = await newPage(group, log)
    const h = harness(page, context, cdp, net, log)
    let metrics = {}
    try {
      metrics = (await group.run(h)) ?? {}
    } catch (e) {
      result.errors.push(`${name} run ${r}: ${String(e?.message || e).split("\n")[0]}`)
    }
    await context.close().catch(() => {})
    const loadAfter = hostLoad()
    const cpuAfter = cpuState()
    // Busy: the machine's load, or a run on the slower E-cores (timings from them don't compare).
    const busy = Math.max(loadBefore ?? 0, loadAfter ?? 0) > BUSY_LOAD || !cpuBefore.pcore
    result.runs.push({ group: name, run: r, load: [loadBefore, loadAfter], cpu: [cpuBefore, cpuAfter], busy, metrics, rows: h.rows })
    if (SHOTS) writeFileSync(join(SHOTS, `${name}-${DEVICE}-${CPU}x-run${r}-requests.txt`), log.join("\n") + "\n")
    console.log(`  run ${r} load ${loadBefore} -> ${loadAfter}, ${cpuBefore.pcore ? "P" : "E"}-cores ${cpuBefore.mhz} -> ${cpuAfter.mhz} MHz, ${cpuAfter.tempC} °C${busy ? " BUSY" : ""}`)
  }
}
await browser.close()

// ---- the medians, the p95s, and the budgets ----
const M = {}
const P = {}
for (const [name] of Object.entries(GROUPS)) {
  const runs = result.runs.filter((r) => r.group === name)
  const keys = new Set(runs.flatMap((r) => Object.keys(r.metrics)))
  for (const k of keys) {
    // Unset in every run: its step was never asked for (--steps), so no row.
    // Null in some: asked for and failed, which an enforced budget counts.
    if (runs.every((r) => r.metrics[k] === undefined)) continue
    const xs = runs.map((r) => r.metrics[k]).filter((x) => typeof x === "number" && Number.isFinite(x))
    M[k] = median(xs)
    P[k] = p95(xs)
  }
}
result.metrics = M
result.p95 = P
result.busyRuns = result.runs.filter((r) => r.busy).length
// A group's budgets carry its scenario's name in scenarios.json (the group's
// own name unless it says otherwise: the calendar's fixture run is
// "calendar-fixtures", beside content.mjs's "calendar" on the demo's data).
const scenarioNames = Object.entries(GROUPS).map(([n, g]) => g.scenario ?? n)
// The device each scenario runs at this slowdown (its line's --device, or a
// computer at 1x and a phone above): a run on another device, a computer at
// 4x for a surface the phone doesn't have, is held to that device's own level.
const registered = JSON.parse(readFileSync(join(here, "scenarios.json"), "utf8")).scenarios
const ownDevice = (name) => {
  const a = registered[name]?.args ?? []
  const i = a.indexOf("--device")
  return i >= 0 ? a[i + 1] : CPU > 1 ? "phone" : "desktop"
}
const checked = new Set()
const rows = scenarioNames
  .flatMap((s) => check(BUDGETS, M, { cpu: CPU, scenarios: [s], skipMissing: true, device: DEVICE, ownDevice: ownDevice(s) }))
  .filter((r) => !checked.has(r.metric) && checked.add(r.metric))
result.budgets = rows
console.log(`\nsurfaces ${ONLY.join(",")}: ${DEVICE} at ${CPU}x, rtt ${RTT} ms, ${RUNS} run(s), ${result.busyRuns} on a busy host (load > ${BUSY_LOAD})`)
console.log("metric".padEnd(30), "median".padStart(8), "p95".padStart(8), "max".padStart(8), "target".padStart(8), " owner verdict")
const shown = new Set()
for (const r of rows) {
  shown.add(r.metric)
  const verdict = r.ok === null ? (r.enforced ? "NOT MEASURED" : "n/a") : r.ok ? (r.target !== null && r.value > r.target ? "ok (over target)" : "ok") : r.enforced ? "MISSED" : "over (report only)"
  console.log(r.metric.padEnd(30), String(r.value ?? "-").padStart(8), String(P[r.metric] ?? "-").padStart(8), String(r.max).padStart(8), String(r.target ?? "").padStart(8), ` ${r.owner.padEnd(6)} ${verdict}`)
}
for (const [k, v] of Object.entries(M)) if (!shown.has(k)) console.log(k.padEnd(30), String(v ?? "-").padStart(8), String(P[k] ?? "-").padStart(8), "(no budget)")
// Per step, the scripts a real browser runs twice (Next 16.3.8's double
// insert; lib.mjs scriptsTwice), median of runs: a report, no budget.
const twice = new Map()
for (const run of result.runs)
  for (const row of run.rows ?? []) {
    const t = twice.get(row.id) ?? { runs: [], kb: [] }
    t.runs.push(row.scriptsTwice?.runs ?? 0)
    t.kb.push(row.scriptsTwice?.kb ?? 0)
    twice.set(row.id, t)
  }
result.scriptsTwice = Object.fromEntries([...twice].map(([id, t]) => [id, { runs: median(t.runs), kb: median(t.kb) }]).filter(([, v]) => v.runs))
if (Object.keys(result.scriptsTwice).length) console.log(`scripts run twice, median a run: ${Object.entries(result.scriptsTwice).map(([id, v]) => `${id} ${v.runs} (${v.kb} KB)`).join(", ")}`)
for (const e of result.errors) console.log(e)
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2))
if (opt("result", null)) writeFileSync(opt("result"), JSON.stringify({ scenario: scenarioNames.join(","), cpu: CPU, device: DEVICE, metrics: M, p95: P, busyRuns: result.busyRuns, checks: rows }, null, 2))
const failed = rows.filter((r) => r.enforced && r.ok !== true).length
if (failed) {
  console.log(`${failed} budget(s) missed or not measured`)
  process.exit(1)
}
