// The shell's surfaces on fixtures: the first load of the app (fluid-15,
// fluid-20's bytes), Home (fluid-01), the activity inbox and its keys
// (fluid-02), the command palette and search (fluid-13), Settings (fluid-14)
// and an overlay opened (fluid-16). Budgets: shell-budgets.json.
import { calendarFixtures, chatFixtures, shellFixtures, workFixtures, workSidebar } from "../workspace.mjs"

// Home is useful once what needs you or today's agenda is drawn, not at its greeting.
/** Home is useful: what needs you, or today's agenda (the calendar group waits for it too). */
export const HOME = { sel: "[data-needs-list] > *, [data-agenda-card]" }
// The page's own region: the sheet's scroller on a computer, the app's on a phone.
const MAIN = "[data-split-view='-1'], [data-app-scroller]"

const group = {
  name: "shell",
  fixtures: () => [...shellFixtures(), ...calendarFixtures(), ...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  async run(h) {
    const { page } = h
    const M = {}

    // ---- the first load: a new tab with nothing cached, straight to Home ----
    const first = await h.step("firstLoad", {
      act: () => h.goto("/app/home"),
      ready: () => h.ready(HOME, { fromNav: true, timeout: 60000 }),
      nav: true,
      settle: 2500,
    })
    M.firstLoadMs = first?.ready
    M.firstLoadKB = first?.net?.scriptKB
    // Of those, until Home is useful, and in the 2.5 s after (what warms once the page is quiet).
    M.firstLoadReadyKB = first?.netReady?.scriptKB
    M.firstLoadWarmKB = first?.netWarm?.scriptKB
    M.firstLoadScripts = first?.net?.scripts
    M.firstLoadLongMs = first?.longMs
    M.firstLoadCls = first?.cls
    M.firstLoadFcpMs = await page.evaluate(() => Math.round(performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0) || null).catch(() => null)

    // ---- Home again, from a channel (a computer's sidebar) or the
    // Channels tab (a phone's tab bar), in the app ----
    await h.push(h.phone ? "/app/channel" : "/app/channel/c4a70000-0000-4000-8000-000000000002")
    await page.waitForTimeout(2000)
    const link = (href) => page.locator(h.phone ? `nav[aria-label="Primary"] a[href="${href}"]` : `a[href="${href}"]`).first()
    const home = await h.step("homeOpen", {
      act: () => h.visit(link("/app/home"), "/app/home"),
      ready: () => h.ready({ ...HOME, path: "/app/home" }),
      blank: MAIN,
      settle: 1500,
    })
    M.homeOpenMs = home?.ready
    M.homeOpenRenders = home?.renders
    M.homeOpenBlankFrames = home?.blankFrames
    M.homeOpenCls = home?.cls

    // ---- a query-only address write on Home, as a tab, a list's filter or
    // the calendar's date writes one (history.replaceState, which Next's
    // router follows). Nothing on Home reads the query, so nothing should
    // render: every useRouter caller did, through LayoutRouterContext
    // (PLATFORM-LEAD-2's navigation hook, 21 Oct 2026). The state is null,
    // as an app's own write's is: Next passes a state carrying its own marker
    // (__NA) straight through, without telling the router ----
    const write = await h.step("queryWrite", {
      act: () => page.evaluate(() => history.replaceState(null, "", `${location.pathname}?probe=1`)),
      settle: 800,
    })
    M.queryWriteRenders = write?.renders

    // ---- the activity inbox, then down its rows by key ----
    const inbox = await h.step("inboxOpen", {
      act: () => h.visit(link("/app/inbox"), "/app/inbox"),
      ready: () => h.ready({ sel: "[data-feed-row]", re: "mentioned you", path: "/app/inbox" }, { timeout: 20000 }),
      blank: MAIN,
      settle: 1200,
    })
    M.inboxOpenMs = inbox?.ready
    M.inboxOpenRenders = inbox?.renders
    if (!h.phone) {
      await page.mouse.move(5, 300)
      const keys = await h.step("inboxKeys", {
        act: async () => {
          for (let i = 0; i < 10; i++) {
            await page.keyboard.press("j")
            await page.waitForTimeout(90)
          }
        },
        typed: 10,
        settle: 500,
      })
      M.inboxKeyP95Ms = keys?.keyP95
      M.rendersPerInboxKey = keys?.rendersPerKey
    }

    // ---- the command palette, and a search typed in it ----
    if (!h.phone) {
      const palette = await h.step("paletteOpen", {
        act: () => page.keyboard.press("Control+k"),
        ready: () => h.ready({ sel: "[cmdk-input]" }, { timeout: 10000 }),
        settle: 600,
      })
      M.paletteOpenMs = palette?.ready
      M.paletteOpenRenders = palette?.renders
      const search = await h.step("searchType", {
        act: () => page.keyboard.type("launch email", { delay: 90 }),
        // Timed from the last key: a task the search found is in the list.
        ready: () => h.ready({ sel: "[cmdk-item]", re: "launch email \\(\\d+\\)" }, { timeout: 15000 }),
        typed: 12,
        settle: 800,
      })
      M.searchResultsMs = search?.ready
      M.searchKeyP95Ms = search?.keyP95
      M.rendersPerSearchKey = search?.rendersPerKey
      await page.keyboard.press("Escape")
      await page.waitForTimeout(500)
    } else {
      const search = await h.step("searchType", {
        act: async () => {
          await h.push("/app/search")
          const box = page.locator("input[type=search], input[role=combobox], input").first()
          await box.waitFor({ timeout: 15000 })
          await box.tap()
          await page.keyboard.type("launch email", { delay: 120 })
        },
        ready: () => h.ready({ sel: "[data-split-view='-1'] a, [data-app-scroller] a, [data-app-scroller] li, [role=option]", re: "launch email \\(\\d+\\)" }, { timeout: 15000 }),
        typed: 12,
        settle: 800,
      })
      M.searchResultsMs = search?.ready
      M.searchKeyP95Ms = search?.keyP95
      M.rendersPerSearchKey = search?.rendersPerKey
    }

    // ---- Settings: the way a person goes ----
    // On a computer from the profile menu's Settings (opened untimed first):
    // where that leads is the build's own (live pushes /app/settings, which
    // replaces itself with the profile page; 706270aa3 goes straight there).
    // On a phone, the settings list (/app/settings).
    let toSettings = () => h.push("/app/settings")
    if (!h.phone) {
      const item = page.getByRole("menuitem", { name: /^Settings\b/ }).first()
      await h.press(page.getByRole("button", { name: "Profile and settings" }).first())
      await item.waitFor({ timeout: 10000 })
      await page.waitForTimeout(300)
      toSettings = () => h.press(item)
    }
    const settings = await h.step("settingsOpen", {
      act: toSettings,
      ready: () => h.ready({ sel: "[data-split-view='-1'] h1, [data-split-view='-1'] h2, [data-app-scroller] h1, [data-app-scroller] h2, [data-large-title]", path: "/app/settings" }, { timeout: 20000 }),
      blank: MAIN,
      settle: 1200,
    })
    M.settingsOpenMs = settings?.ready
    M.settingsOpenRenders = settings?.renders
    // Script fetched from the press until Settings is useful: ~0 once its page module is warm (fluid-14).
    M.settingsOpenKB = settings?.netReady?.scriptKB

    // ---- an overlay: the keyboard shortcuts on a computer, the account sheet on a phone ----
    await h.push("/app/home")
    await page.waitForTimeout(2000)
    const overlay = await h.step("overlayOpen", {
      act: async () => {
        if (h.phone) await h.press(page.getByRole("button", { name: /^(Account|Profile|You|Me|SR|Sam Rivera)/ }).first())
        else await page.keyboard.press("Shift+?")
      },
      ready: () => h.ready({ sel: "[role=dialog], [data-vaul-drawer], [role=menu]" }, { timeout: 10000 }),
      // Its entry: 500 ms from its first paint (a phone sheet's slide is 500 ms).
      frames: { from: "ready", ms: 500 },
      settle: 800,
    })
    M.overlayOpenMs = overlay?.ready
    M.overlayOpenInpMs = overlay?.inp
    M.overlayFrameP95Ms = overlay?.frames?.p95
    M.overlayOpenRenders = overlay?.renders
    await page.keyboard.press("Escape")
    return M
  },
}

export default group
