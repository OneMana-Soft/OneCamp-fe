// The time from a first intent to what it opens: a hover or a Tab onto a
// control, to its popup on screen, on a cold load and once the page has
// settled. The control is a tooltip's trigger the shell draws on every /app
// route: since H2 (5 Nov 2026) components/ui/tooltip fetches its Radix side on
// the first intent or on idle, so a cold intent may wait for code. Each intent
// gets a new tab of its own (h.fresh), so each is a first. Budgets:
// intent-budgets.json, report only.
//
// On a phone (--device phone) it takes what a finger and a screen reader get
// instead: a tap opens nothing, a long press does (timed from the press, on a
// cold load), and while open the trigger names the popup (aria-describedby)
// whose text is in the accessibility tree; while closed, the trigger's name
// and description as the accessibility tree has them.
import { calendarFixtures, chatFixtures, shellFixtures, workFixtures, workSidebar } from "../workspace.mjs"
import { HOME } from "./shell.mjs"

/**
 * What is timed, on a computer: a trigger every /app route's sidebar draws,
 * the popup it opens and its text; delayMs, the hover delay the trigger keeps
 * (Tooltip's own 400, which wins over ClientProviders' 500); code, a string
 * only the popup's script carries (Radix tooltip's open event), to tell when
 * that script came. The focusable before the trigger (a Tab's start) is the
 * section's chevron, which has no tooltip of its own.
 */
const DESK = { path: "/app/home", viewport: { width: 1280, height: 800 }, trigger: 'button[aria-label="New project"]', popup: '[role="tooltip"]', text: "New project", delayMs: 400, code: "tooltip.open" }
/** On a phone: Home draws no tooltip; a channel's composer does (its emoji button). */
const PHONE = { path: "/app/channel/c4a70000-0000-4000-8000-000000000002", trigger: 'button[aria-label="Insert emoji"]', popup: '[role="tooltip"]', text: "Emoji", code: "tooltip.open" }

// ---- in the page, from its first script: when the intent came (the input's own time) ----
function intentClock(triggers) {
  try {
    performance.setResourceTimingBufferSize(5000)
  } catch {
    /* an old browser keeps its 250 */
  }
  const on = (e) => {
    if (window.__fluIntentAt !== undefined) return
    const onTrigger = e.target instanceof Element && triggers.some((s) => e.target.closest(s))
    if (e.type === "keydown" ? e.key === "Tab" : onTrigger) window.__fluIntentAt = e.timeStamp
  }
  for (const type of ["pointermove", "touchstart", "keydown"]) addEventListener(type, on, true)
}

/** Waits, frame by frame, for the popup holding `text` to be laid out on screen; ms since the intent. */
async function shown(page, T, timeout = 30000) {
  const handle = await page.waitForFunction(
    ({ popup, text }) => {
      const at = window.__fluIntentAt
      if (at === undefined) return false
      for (const el of document.querySelectorAll(popup)) {
        if (!(el.textContent || "").includes(text)) continue
        // A tooltip's role sits on a 1 px copy for screen readers: its box is the nearest ancestor with a size.
        let box = el
        while (box && box.getBoundingClientRect().width < 4) box = box.parentElement
        const r = box?.getBoundingClientRect()
        // Placed: a popper is held above the page (translate -200%) until it is positioned.
        if (r && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) return Math.max(0, Math.round(performance.now() - at))
      }
      return false
    },
    { popup: T.popup, text: T.text },
    { polling: "raf", timeout },
  )
  return handle.jsonValue()
}

/** Every script response this tab gets, by request id (its body is read later, off the timed part). */
function scriptsOf(cdp) {
  const scripts = new Map()
  cdp.on("Network.responseReceived", (e) => e.type === "Script" && scripts.set(e.requestId, { url: e.response.url }))
  cdp.on("Network.loadingFinished", (e) => scripts.has(e.requestId) && (scripts.get(e.requestId).done = true))
  return scripts
}

/** The scripts in so far that carry `code`. */
async function carriers(cdp, scripts, code) {
  const out = []
  for (const [requestId, s] of scripts) {
    if (!s.done) continue
    if (s.carries === undefined) {
      const b = await cdp.send("Network.getResponseBody", { requestId }).catch(() => null)
      s.carries = !!b && (b.base64Encoded ? Buffer.from(b.body, "base64").toString("utf8") : b.body).includes(code)
    }
    if (s.carries) out.push(s.url)
  }
  return out
}

/**
 * The popup's script against the intent: whether it was in before the intent
 * (1) or not (0), the one that came (the first after the intent, or the last
 * before it), its body on the wire and decoded, and when its response ended
 * (ms from the intent; negative: before it).
 */
async function codeAgainstIntent(page, cdp, scripts, code) {
  const urls = await carriers(cdp, scripts, code)
  return page.evaluate((urls) => {
    const at = window.__fluIntentAt
    const es = urls.flatMap((u) => performance.getEntriesByName(u)).sort((a, b) => a.startTime - b.startTime)
    if (at === undefined || !es.length) return { codeIn: es.length ? 1 : 0, codeFiles: es.length }
    const before = es.filter((e) => e.responseEnd <= at)
    const e = es.find((x) => x.responseEnd > at) ?? before[before.length - 1]
    return {
      codeIn: before.length ? 1 : 0,
      codeFiles: es.length,
      codeFile: e.name.replace(/^.*\/_next\/static\//, ""),
      codeKB: Math.round(e.encodedBodySize / 102.4) / 10,
      codeDecodedKB: Math.round(e.decodedBodySize / 102.4) / 10,
      codeAtMs: Math.round(e.responseEnd - at),
      codeFetchMs: Math.round(e.responseEnd - e.startTime),
    }
  }, urls)
}

/**
 * Waits for the page to settle and the popup's script to come: Home useful,
 * then 2.5 s (as the shell's first load settles), and the script in, or 4 s
 * from Home useful, whichever is first after the 2.5 s. The ms waited.
 */
async function settled(h, scripts, code) {
  const t0 = Date.now()
  for (;;) {
    const waited = Date.now() - t0
    if (waited >= 4000 || (waited >= 2500 && (await carriers(h.cdp, scripts, code)).length)) return waited
    await h.page.waitForTimeout(100)
  }
}

/** The trigger as a screen reader has it, and the popups in the page. */
async function spoken(h, T) {
  const dom = await h.page.evaluate(
    ({ trigger, popup }) => {
      const t = document.querySelector(trigger)
      return { label: t?.getAttribute("aria-label") ?? null, describedby: t?.getAttribute("aria-describedby") ?? null, tips: [...document.querySelectorAll(popup)].map((p) => ({ id: p.id, text: (p.textContent || "").trim() })) }
    },
    { trigger: T.trigger, popup: T.popup },
  )
  await h.cdp.send("Accessibility.enable").catch(() => {})
  const { nodes } = await h.cdp.send("Accessibility.getFullAXTree").catch(() => ({ nodes: [] }))
  const live = nodes.filter((n) => !n.ignored)
  const own = live.find((n) => n.name?.value === dom.label && /button/i.test(n.role?.value ?? ""))
  const tip = live.find((n) => n.role?.value === "tooltip")
  return { ...dom, axRole: own?.role?.value ?? null, axName: own?.name?.value ?? null, axDescription: own?.description?.value ?? null, axTooltip: tip ? (tip.name?.value ?? "") : null }
}

/** A cold tab (the run's first, or a new one) on T.path, until the trigger is on screen: its ms from the navigation. */
async function coldTab(h, T, first) {
  if (!first) await h.fresh()
  const scripts = scriptsOf(h.cdp)
  if (T.viewport) await h.page.setViewportSize(T.viewport)
  await h.goto(T.path)
  const triggerMs = await h.ready({ sel: T.trigger }, { fromNav: true, timeout: 60000 })
  return { scripts, triggerMs }
}

/**
 * One intent on a computer, in a tab of its own: a hover (the pointer moves
 * onto the trigger once) or a Tab (from the focusable before it, focused by
 * script), as soon as the trigger is on screen, or once the page has settled
 * (idle). wire: every script asked for from the intent on is held one round
 * trip (h.rtt), as a network has it; this harness serves scripts from
 * localhost at once.
 */
async function intent(h, id, { how, idle = false, wire = false, first = false }) {
  const T = DESK
  const row = { id, ok: false }
  let scripts
  try {
    const tab = await coldTab(h, T, first)
    scripts = tab.scripts
    row.triggerMs = tab.triggerMs
    const { page } = h
    if (idle) {
      row.homeMs = await h.ready(HOME, { fromNav: true, timeout: 60000 })
      row.idleWaitMs = await settled(h, scripts, T.code)
    }
    if (wire) {
      await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
        await new Promise((r) => setTimeout(r, h.rtt))
        await route.continue().catch(() => {})
      })
    }
    if (how === "tab") {
      row.from = await page.evaluate((sel) => {
        const t = document.querySelector(sel)
        const all = [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0)
        const prev = all[all.indexOf(t) - 1]
        prev?.focus()
        return prev ? `${prev.tagName.toLowerCase()} ${prev.getAttribute("aria-label") || (prev.textContent || "").trim().slice(0, 30)}` : null
      }, T.trigger)
      if (!row.from) throw new Error("nothing focusable before the trigger")
      await page.keyboard.press("Tab")
    } else {
      const b = await page.locator(T.trigger).first().boundingBox()
      if (!b) throw new Error("the trigger has no box")
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    }
    // A popup not on screen 10 s after its intent isn't coming: the row says so (row.shown 0).
    row.ready = await shown(page, T, 10000)
    row.ok = true
  } catch (e) {
    row.error = String(e?.message || e).split("\n")[0].slice(0, 200)
  }
  row.shown = row.ready != null ? 1 : 0
  // Where focus is (the trigger, after a Tab) and the popups in the page, shown or not.
  Object.assign(
    row,
    await h.page
      .evaluate(({ trigger, popup }) => ({ focused: document.activeElement === document.querySelector(trigger), popups: document.querySelectorAll(popup).length }), { trigger: T.trigger, popup: T.popup })
      .catch(() => ({})),
  )
  // Late bodies land; then the popup's script against the intent.
  await h.page.waitForTimeout(300)
  if (scripts) Object.assign(row, await codeAgainstIntent(h.page, h.cdp, scripts, T.code).catch((e) => ({ codeError: String(e?.message || e).slice(0, 120) })))
  if (how === "hover" && row.ready != null) row.overDelayMs = row.ready - T.delayMs
  h.rows.push(row)
  console.log(
    `  ${row.ok ? "ok " : "ERR"} ${id}: ${row.ready ?? "-"} ms (trigger at ${row.triggerMs ?? "-"} ms${idle ? `, waited ${row.idleWaitMs} ms` : ""}${row.from ? `, Tab from ${row.from}, focus on it ${row.focused}` : ""}, ${row.popups} popup(s) in the page), code ${row.codeIn ? "in before" : "came after"}: ${row.codeFile ?? "-"} ${row.codeKB ?? "-"} KB (${row.codeDecodedKB ?? "-"} decoded) at ${row.codeAtMs ?? "-"} ms${row.error ? `: ${row.error}` : ""}`,
  )
  return row
}

/** A finger's press on the trigger: down, held `holdMs`, up. */
async function press(h, T, holdMs) {
  const b = await h.page.locator(T.trigger).first().boundingBox()
  if (!b) throw new Error("the trigger has no box")
  const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  await h.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [p] })
  return {
    hold: () => h.page.waitForTimeout(holdMs),
    up: () => h.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
  }
}

/** What a phone gets: closed, a tap, then (a new cold tab) a long press, and what a screen reader hears of each. */
async function phone(h) {
  const T = PHONE
  const M = {}
  const row = { id: "phone", ok: false }
  try {
    // Closed, then a tap: does anything show in the 1.5 s after?
    await coldTab(h, T, true)
    await h.page.waitForTimeout(1500)
    row.closed = await spoken(h, T)
    await h.page.evaluate((popup) => {
      window.__fluTipSeen = 0
      const look = () => {
        if ([...document.querySelectorAll(popup)].some((el) => el.getClientRects().length)) window.__fluTipSeen = 1
        if (!window.__fluTipDone) requestAnimationFrame(look)
      }
      requestAnimationFrame(look)
    }, T.popup)
    const tap = await press(h, T, 60)
    await tap.hold()
    await tap.up()
    await h.page.waitForTimeout(1500)
    row.tapShows = await h.page.evaluate(() => ((window.__fluTipDone = true), window.__fluTipSeen))
    // A long press on a cold tab: from the press to the popup on screen, the finger still down.
    const { scripts } = await coldTab(h, T, false)
    const long = await press(h, T, 0)
    row.longPressMs = await shown(h.page, T, 15000)
    row.open = await spoken(h, T)
    await long.up()
    await h.page.waitForTimeout(300)
    Object.assign(row, await codeAgainstIntent(h.page, h.cdp, scripts, T.code))
    row.ok = true
  } catch (e) {
    row.error = String(e?.message || e).split("\n")[0].slice(0, 200)
  }
  h.rows.push(row)
  const o = row.open
  const tipId = o?.tips?.find((t) => t.text.includes(T.text))?.id
  M.tapShows = row.tapShows ?? null
  M.longPressColdMs = row.longPressMs ?? null
  M.longPressCodeIn = row.codeIn ?? null
  M.openDescribedByTip = o ? (tipId && o.describedby === tipId ? 1 : 0) : null
  M.openAxTooltip = o ? (o.axTooltip?.includes(T.text) ? 1 : 0) : null
  M.closedDescribedBy = row.closed ? (row.closed.describedby ? 1 : 0) : null
  console.log(`  ${row.ok ? "ok " : "ERR"} phone: tap shows ${row.tapShows}, long press ${row.longPressMs ?? "-"} ms (code ${row.codeIn ? "in before" : "came after"} ${row.codeKB ?? "-"} KB)${row.error ? `: ${row.error}` : ""}`)
  console.log(`      closed: name "${row.closed?.axName}" (${row.closed?.axRole}), description ${JSON.stringify(row.closed?.axDescription)}, aria-describedby ${row.closed?.describedby}`)
  console.log(`      open: aria-describedby ${o?.describedby} (popup id ${tipId}), description ${JSON.stringify(o?.axDescription)}, tooltip in the tree ${JSON.stringify(o?.axTooltip)}`)
  return M
}

const group = {
  name: "intent",
  fixtures: () => [...shellFixtures(), ...calendarFixtures(), ...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  initScripts: [{ fn: intentClock, arg: [DESK.trigger, PHONE.trigger] }],
  async run(h) {
    if (h.phone) return phone(h)
    const M = {}
    const put = (name, r) => {
      M[`${name}Ms`] = r.ready ?? null
      // 1: the popup came; 0: it never did (its Ms is then unmeasured, and the median is of the runs it came in).
      M[`${name}Shown`] = r.shown
      M[`${name}CodeIn`] = r.codeIn ?? null
      if (r.overDelayMs !== undefined) M[`${name}OverDelayMs`] = r.overDelayMs
      // The popup's script came after the intent: when its response ended, from the intent.
      if (r.codeIn === 0 && r.codeAtMs != null) M[`${name}CodeAtMs`] = r.codeAtMs
    }
    const hoverCold = await intent(h, "hoverCold", { how: "hover", first: true })
    put("hoverCold", hoverCold)
    M.triggerColdMs = hoverCold.triggerMs ?? null
    put("tabCold", await intent(h, "tabCold", { how: "tab" }))
    const hoverIdle = await intent(h, "hoverIdle", { how: "hover", idle: true })
    put("hoverIdle", hoverIdle)
    M.idleWaitMs = hoverIdle.idleWaitMs ?? null
    put("tabIdle", await intent(h, "tabIdle", { how: "tab", idle: true }))
    put("hoverColdWire", await intent(h, "hoverColdWire", { how: "hover", wire: true }))
    put("tabColdWire", await intent(h, "tabColdWire", { how: "tab", wire: true }))
    // The popup's script, as the cold hover met it.
    M.tipChunkKB = hoverCold.codeKB ?? null
    M.tipChunkDecodedKB = hoverCold.codeDecodedKB ?? null
    return M
  },
}

export default group
