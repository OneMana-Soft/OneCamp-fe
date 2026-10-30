// The calendar on fixtures (fluid-10, fluid-11): Home to the calendar until
// its week draws, the next week by its key, the views switched, an event
// opened, and a meeting drawn on the grid by dragging. Budgets:
// calendar-budgets.json (CAL-LEAD's), the fixture rows beside the demo's.
import { calendarFixtures, chatFixtures, workFixtures, workSidebar } from "../workspace.mjs"
import { HOME } from "./shell.mjs"

const DRAWN = "[data-calendar] [data-hue-block], [data-calendar] [data-agenda] li"

const group = {
  name: "calendar",
  scenario: "calendar-fixtures",
  fixtures: () => [...calendarFixtures(), ...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  async run(h) {
    const { page } = h
    const M = {}

    // Home first, as a person arrives; then the calendar, in the app. Only once
    // Home is useful: on a busy 4x phone a push made while Home still loaded
    // was dropped (the run timed out on Home) or timed Home's own work.
    await h.goto("/app/home")
    await h.ready(HOME, { fromNav: true, timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1500)
    // On a computer by its keys (G, then K: the sidebar keeps Calendar behind
    // More), timed from the K; on a phone by the router (behind its More sheet).
    const open = await h.step("calendarOpen", {
      act: async () => {
        if (h.phone) return h.push("/app/calendar")
        await page.mouse.move(5, 400)
        await page.keyboard.press("g")
        await page.keyboard.press("k")
      },
      ready: () => h.ready({ sel: DRAWN, path: "/app/calendar" }, { timeout: 30000 }),
      blank: "[data-split-view='-1'], [data-app-scroller]",
      settle: 1500,
    })
    M.calOpenMs = open?.ready
    M.calOpenRenders = open?.renders
    M.calOpenBlankFrames = open?.blankFrames

    // The next period five times by its key (J), then back to today (T).
    if (!h.phone) {
      const next = await h.step("calNext", {
        act: async () => {
          for (let i = 0; i < 5; i++) {
            await page.keyboard.press("j")
            await page.waitForTimeout(300)
          }
        },
        typed: 5,
        settle: 600,
      })
      M.calNextP95Ms = next?.keyP95
      M.rendersPerCalNext = next?.renders != null ? Math.round(next.renders / 5) : null
      await page.keyboard.press("t")
      await page.waitForTimeout(1200)

      // Views: Month, Day, Week, by the switcher.
      const view = (name) => page.locator("[data-calendar-views] button, [data-calendar-views] [role=radio], [data-calendar-views] [role=tab]").filter({ hasText: new RegExp(`^\\s*${name}\\s*$`, "i") }).first()
      let worst = null
      let worstRenders = null
      for (const name of ["Month", "Day", "Week"]) {
        const s = await h.step(`calView${name}`, { act: () => view(name).click({ timeout: 10000 }), settle: 700 })
        if (s?.inp != null) worst = Math.max(worst ?? 0, s.inp)
        if (s?.renders != null) worstRenders = Math.max(worstRenders ?? 0, s.renders)
      }
      M.calViewSwitchP95Ms = worst
      M.rendersPerCalViewSwitch = worstRenders
      // Year (B1's later steps, cal-b1y), on a build that has it: reported
      // apart, so the switch's worst still compares with builds without it.
      // The week comes back untimed for the event's card.
      if (await view("Year").count()) {
        const y = await h.step("calViewYear", { act: () => view("Year").click({ timeout: 10000 }), settle: 700 })
        M.calViewYearInpMs = y?.inp
        M.calViewYearRenders = y?.renders
        await view("Week")
          .click({ timeout: 10000 })
          .catch(() => {})
        await page.waitForTimeout(1200)
      }
    } else {
      // A phone moves a day at a time along its week strip.
      const strip = page.locator("[data-week-strip] button").nth(4)
      const next = await h.step("calNext", { act: () => h.press(strip), ready: () => h.ready({ sel: DRAWN }, { timeout: 10000 }), settle: 700 })
      M.calNextP95Ms = next?.inp
      M.rendersPerCalNext = next?.renders
    }

    // An event, opened: its card on a computer, its sheet or page on a phone.
    const event = page.locator('[data-calendar] [data-hue-block="event"]').first()
    const card = await h.step("calEventOpen", {
      act: () => h.press(event),
      ready: () => h.ready({ sel: "[data-event-popover], [data-event-sheet], [data-event-card]" }, { timeout: 15000 }),
      settle: 800,
    })
    M.calEventOpenMs = card?.ready
    M.calEventOpenInpMs = card?.inp
    M.calEventOpenRenders = card?.renders
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    if (h.phone && page.url().includes("/calendar/event/")) {
      await page.goBack().catch(() => {})
      await page.waitForTimeout(1500)
    }

    // A meeting drawn on the grid: a press in an empty two hours of a day on
    // screen (Wednesday's first), dragged down two hours. A press on an
    // event moves it instead of drawing, so where the free time falls, which
    // the clock decides, chooses the place (2 of 5 runs had pressed an event).
    if (!h.phone) {
      const scroller = page.locator("[data-time-grid-scroll], [data-week-scroll]").first()
      const view = (await scroller.boundingBox()) ?? { y: 0, height: page.viewportSize().height }
      const slot = await page.evaluate(
        ({ top, bottom }) => {
          const cols = [...document.querySelectorAll("[data-day-col]")]
          for (const i of [2, 3, 1, 4, 0, 5, 6]) {
            const col = cols[i]
            if (!col) continue
            const r = col.getBoundingClientRect()
            const hour = r.height / 24
            const busy = [...col.querySelectorAll("[data-hue-block]")].map((b) => b.getBoundingClientRect()).map((q) => [q.top, q.bottom])
            const lo = Math.max(r.top, top) + 8
            const hi = Math.min(r.bottom, bottom) - 2 * hour - 8
            for (let y = lo; y <= hi; y += hour / 4) if (!busy.some(([a, b]) => y < b + 4 && y + 2 * hour > a - 4)) return { x: r.left + r.width / 2, y, hour }
          }
          return null
        },
        { top: view.y, bottom: Math.min(view.y + view.height, page.viewportSize().height) },
      )
      const draft = await h.step("calDragCreate", {
        act: async () => {
          if (!slot) throw new Error("no empty two hours on screen to draw in")
          const { x, y: top, hour } = slot
          await page.mouse.move(x, top)
          await page.mouse.down()
          for (let i = 1; i <= 16; i++) {
            await page.mouse.move(x, top + (hour * 2 * i) / 16)
            await page.waitForTimeout(16)
          }
          // The card is timed from the release, not the press.
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.mouse.up()
        },
        ready: () => h.ready({ sel: "[data-quick-create]" }, { timeout: 10000 }),
        frames: true,
        settle: 800,
      })
      M.calDragFrameP95Ms = draft?.frames?.p95
      M.calDragDroppedPct = draft?.frames?.droppedPct
      M.calDragToCardMs = draft?.ready
      M.calDragRenders = draft?.renders
      await page.keyboard.press("Escape")
    }
    return M
  },
}

export default group
