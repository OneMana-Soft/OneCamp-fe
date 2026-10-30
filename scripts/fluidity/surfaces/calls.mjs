// The calls on fixtures (fluid-12; calls A5, CALLS-11): from Home to an
// instant call's green room until it can be started, its camera preview drawn
// from the browser's fake device. Budgets: calls-budgets.json (CALLS-LEAD's).
//
// The shell's fixtures answer /config/client with no features, so a call page
// says calling isn't set up; this group's answer turns calls on. Joining, to
// the first remote frame, needs a call server and is the perf harness's
// (design/calls-vs-zoom/perf-harness/join.mjs), not this fixture run.
import { chatFixtures, workFixtures, workSidebar } from "../workspace.mjs"
import { HOME } from "./shell.mjs"

const CALLS_ON = [/\/config\/client$/, { msg: "ok", data: { features: { calls: true } } }]

const group = {
  name: "calls",
  scenario: "calls-fixtures",
  fixtures: () => [CALLS_ON, ...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  async run(h) {
    const { page } = h
    const M = {}

    // Home first, as a person arrives, and only once it is useful: a push
    // made while Home still loads times Home's own work.
    await h.goto("/app/home")
    await h.ready(HOME, { fromNav: true, timeout: 60000 }).catch(() => {})
    await page.waitForTimeout(1500)

    // The green room, until its button (Join, or an instant call's Start
    // meeting) can be pressed and the camera preview is drawn or starting.
    const green = await h.step("greenRoomOpen", {
      act: () => h.push("/app/meet/instant"),
      ready: () =>
        h.until(() => {
          const room = document.querySelector("[data-prejoin]")
          if (!room) return false
          const go = [...room.querySelectorAll("button")].find((b) => /^\s*(Join|Start)/.test(b.textContent || ""))
          return !!go && !go.disabled && !!room.querySelector("[data-preview] video, [data-camera-state]")
        }, null, { timeout: 30000 }),
      settle: 1500,
    })
    M.greenRoomMs = green?.ready
    M.greenRoomLongMs = green?.longMs
    M.greenRoomRenders = green?.renders
    M.greenRoomKB = green?.net?.scriptKB
    return M
  },
}

export default group
