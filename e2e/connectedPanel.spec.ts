import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { docInfo, stubBackend, withStatus, type Answers } from "./stubbedApp"

// The Connected panel (the work graph, DG5) on a doc, in a real browser with
// every request answered here: the popover beside the header's button on a
// computer and a sheet with its action pinned on a phone; the list grouped by
// kind with its reasons; "How is this connected to…" from a search to each
// way two things connect; and the loading, empty, failed and no-access
// states. With CONNECTED_SHOTS=<dir> it also saves each state at its size in
// light and dark, for design review (never committed: shots are evidence).

const DOC = "4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const TASK = "5c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const PROJ = "6c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const MAYA = "7c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const CH = "8c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const MSG = "9c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const SPEC = "ac1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const SAMID = "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b"
const SHOTS = process.env.CONNECTED_SHOTS || ""

const hop = (rel: string, kind: string, id: string, title: string, data?: Record<string, unknown>) => ({ rel, kind, id, title, data })
const task = hop("linked_from", "task", TASK, "Record the launch film")
const proj = hop("in_project", "project", PROJ, "Autumn launch")
const msg = hop("shared_in", "message", MSG, "Here's the plan for the film shoot", { channel_id: CH, channel_name: "launch", by_name: "Maya Chen" })
const chan = hop("in_channel", "channel", CH, "launch")
const spec = hop("links_to", "doc", SPEC, "Shot list and storyboard")
const sam = hop("created_by", "person", SAMID, "Sam Rivera")
const maya = hop("assigned_to", "person", MAYA, "Maya Chen")

const connected = {
  data: {
    root: hop("", "doc", DOC, "Launch film plan"),
    depth: 2,
    groups: [
      { kind: "doc", items: [{ ...spec, depth: 1, path: [spec] }], more: false },
      { kind: "task", items: [{ ...task, depth: 1, path: [task] }], more: false },
      { kind: "project", items: [{ ...proj, depth: 2, path: [task, proj] }], more: false },
      { kind: "person", items: [{ ...sam, depth: 1, path: [sam] }, { ...maya, depth: 2, path: [task, maya] }], more: false },
      { kind: "channel", items: [{ ...chan, depth: 2, path: [msg, chan] }], more: false },
      { kind: "message", items: [{ ...msg, depth: 1, path: [msg] }], more: false },
    ],
  },
}
// DG6: a direct message that links the doc, opened where the server says it
// opens for the reader.
const DM = "bc1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const dm = hop("linked_from", "chat", DM, "", { by_name: "Maya Chen", path: `/app/chat/${MAYA}/${DM}` })
const withDM = { data: { ...connected.data, groups: [...connected.data.groups, { kind: "chat", items: [{ ...dm, depth: 1, path: [dm] }], more: false }] } }
const empty = { data: { root: hop("", "doc", DOC, "Launch film plan"), depth: 2, groups: [] } }
// DG13: the weekly sync whose notes link the doc.
const SYNC = "5e1f2a3b-4c5d-4e6f-8a7b-9c0d1e2f3a4b"
const sync = hop("linked_from", "event", SYNC, "Weekly launch sync", { start: { at: "2026-10-26T10:00:00Z", zone: "UTC" }, all_day: false, repeats: true })
const withMeeting = {
  data: {
    ...connected.data,
    groups: [...connected.data.groups.slice(0, 3), { kind: "event", items: [{ ...sync, depth: 1, path: [sync] }], more: false }, ...connected.data.groups.slice(3)],
  },
}
// A task's connections, for the phone bar's button that loads with its first draw (LazyConnected).
const onTask = { data: { root: hop("", "task", TASK, "Record the launch film"), depth: 2, groups: [{ kind: "doc", items: [{ ...hop("links_to", "doc", DOC, "Launch film plan"), depth: 1, path: [hop("links_to", "doc", DOC, "Launch film plan")] }], more: false }] } }
const paths = {
  data: {
    from: hop("", "doc", DOC, "Launch film plan"),
    to: hop("", "project", PROJ, "Autumn launch"),
    paths: [{ hops: [task, proj] }, { hops: [spec, hop("linked_from", "project", PROJ, "Autumn launch")] }],
  },
}

// docs F1: a folder, the files in it and a link the doc holds, each saying
// what it is (data.node_kind), and a way to a project through the folder.
const FIN = "dc1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const Q3 = "ec1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const DECK = "fc1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const FORECAST = "0d1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const RECEIPTS = "1d1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f"
const fin = hop("in_folder", "doc", FIN, "Finance", { node_kind: "folder" })
const q3 = hop("contains", "doc", Q3, "Q3 budget.xlsx", { node_kind: "file" })
const deck = hop("contains", "doc", DECK, "Board deck.pdf", { node_kind: "file" })
const receipts = hop("contains", "doc", RECEIPTS, "Receipts", { node_kind: "folder", color: "sun" })
const forecast = hop("holds", "doc", FORECAST, "Forecast", { node_kind: "link", color: "sky" })
const inFolder = {
  data: {
    root: hop("", "doc", DOC, "Launch film plan"),
    depth: 2,
    groups: [
      {
        kind: "doc",
        items: [
          { ...fin, depth: 1, path: [fin] },
          { ...forecast, depth: 1, path: [forecast] },
          { ...q3, depth: 2, path: [fin, q3] },
          { ...deck, depth: 2, path: [fin, deck] },
          { ...receipts, depth: 2, path: [fin, receipts] },
        ],
        more: false,
      },
      { kind: "task", items: [{ ...task, depth: 1, path: [task] }], more: false },
    ],
  },
}
const throughFolder = {
  data: {
    from: hop("", "doc", DOC, "Launch film plan"),
    to: hop("", "project", PROJ, "Autumn launch"),
    paths: [{ hops: [fin, q3, hop("linked_from", "project", PROJ, "Autumn launch")] }],
  },
}
// The way through the folder, and the file's doc for a row's warm-up under the pointer.
const folderAnswers: Answers = { "/graph/path": throughFolder, [`/doc/getDocInfo/${Q3}`]: docInfo({ doc_uuid: Q3, doc_title: "Q3 budget.xlsx" }) }

async function openDoc(page: Page, testInfo: TestInfo, graph: unknown, theme: "light" | "dark" = "light", extra: Answers = {}, routes?: (page: Page) => Promise<unknown>) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("ui-theme", t)
      localStorage.setItem("theme", t)
    } catch {}
  }, theme)
  await page.emulateMedia({ colorScheme: theme })
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch film plan", doc_body: "<p>Shoot on Friday.</p>" }),
    // A row under the pointer warms its doc (IntentLink), and the doc page asks its access and a token.
    [`/doc/getDocInfo/${SPEC}`]: docInfo({ doc_uuid: SPEC, doc_title: "Shot list and storyboard" }),
    [`/doc/access/${DOC}`]: { data: { doc_uuid: DOC, level: "view", owner: false, lock: "", locked: false, can_share: false, can_lock_soft: false, can_lock_hard: false } },
    "/auth/token": { data: { token: "e2e-sam" } },
    "/graph/connected": graph,
    "/graph/path": paths,
    "/search/unifiedSearch/": { data: { page: [{ type: "project", project: { project_id: PROJ, project_name: "Autumn launch" } }, { type: "user", user: { user_uuid: MAYA, user_full_name: "Maya Chen" } }], has_more: false } },
    ...extra,
  })
  // A route added after the stub's answers first (Playwright tries the newest first).
  await routes?.(page)
  if (process.env.CONNECTED_DEBUG) page.on("response", (r) => r.status() === 404 && console.log("404", new URL(r.url()).pathname))
  await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  await page.waitForTimeout(350) // the panel's 180 ms entrance, settled
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const trigger = (page: Page) => page.getByRole("button", { name: "Connected: what this connects to" }).first()

for (const theme of ["light", "dark"] as const) {
  test.describe(`on a computer (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 } })

    test("the panel groups what's connected and finds how two things connect", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, connected, theme)
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      await expect(panel.getByRole("link", { name: /Autumn launch, Its project · via Record the launch film/ })).toBeVisible({ timeout: 30_000 })
      await expect(panel.getByText("Shared in a message · Maya Chen")).toBeVisible()
      await shot(page, `list-1280-${theme}`)
      // Hover and keyboard focus on a row.
      await panel.getByRole("link", { name: /Shot list and storyboard/ }).hover()
      await shot(page, `hover-1280-${theme}`)
      await panel.getByRole("radio", { name: "Tasks" }).click()
      await expect(panel.getByRole("link", { name: /Autumn launch/ })).toHaveCount(0)
      await shot(page, `filtered-1280-${theme}`)
      await panel.getByRole("radio", { name: "All" }).click()
      await panel.getByRole("button", { name: "How is this connected to…" }).click()
      await shot(page, `finder-1280-${theme}`)
      await panel.getByRole("searchbox", { name: "Find something to connect to" }).fill("autumn")
      await panel.getByRole("option", { name: /Autumn launch/ }).click()
      await expect(panel.getByRole("region", { name: /^Way 1: Launch film plan is linked from Record the launch film is in Autumn launch$/ })).toBeVisible()
      await shot(page, `paths-1280-${theme}`)
      await page.keyboard.press("Escape")
      await expect(panel).toHaveCount(0)
      await expect(trigger(page)).toBeFocused()
    })

    test("a meeting that discussed the doc says so, with its day, and opens on the calendar (DG13)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withMeeting, theme)
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      const row = panel.getByRole("link", { name: /^Weekly launch sync, Discussed this · \d+ \w+/ })
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row).toHaveAttribute("href", `/app/calendar/event/${SYNC}`)
      await expect(panel.getByRole("radio", { name: "Meetings" })).toBeVisible()
      await shot(page, `meeting-1280-${theme}`)
      await row.hover()
      await shot(page, `meeting-hover-1280-${theme}`)
    })

    test("a folder, a file and a link say what they are, and a way through the folder (docs F1)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, inFolder, theme, folderAnswers)
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      const folder = panel.getByRole("link", { name: "Finance, Its folder" })
      await expect(folder).toBeVisible({ timeout: 30_000 })
      await expect(folder.locator("[data-node-kind=folder]")).toBeVisible()
      // An uncoloured folder's sunken tile keeps an edge on the white panel, as the docs tree's does.
      await expect(folder.locator("[data-node-kind=folder]")).toHaveCSS("box-shadow", /1px inset/)
      const sheet = panel.getByRole("link", { name: "Q3 budget.xlsx, In the same folder · via Finance" })
      await expect(sheet.locator("[data-file-kind=sheet]")).toBeVisible()
      await expect(sheet).toHaveAttribute("data-hue", "moss")
      await expect(panel.getByRole("link", { name: "Board deck.pdf, In the same folder · via Finance" })).toHaveAttribute("data-hue", "berry")
      await expect(panel.getByRole("link", { name: "Forecast, In this page" })).toHaveAttribute("data-hue", "sky")
      await expect(panel.getByRole("link", { name: "Receipts, In the same folder · via Finance" })).toHaveAttribute("data-hue", "sun")
      await shot(page, `folders-1280-${theme}`)
      await sheet.hover()
      await shot(page, `folders-hover-1280-${theme}`)
      await panel.getByRole("button", { name: "How is this connected to…" }).click()
      await panel.getByRole("searchbox", { name: "Find something to connect to" }).fill("autumn")
      await panel.getByRole("option", { name: /Autumn launch/ }).click()
      await expect(panel.getByRole("region", { name: /^Way 1: Launch film plan is in the folder Finance contains Q3 budget\.xlsx is linked from Autumn launch$/ })).toBeVisible()
      await expect(panel.getByRole("link", { name: "Finance, Folder" })).toBeVisible()
      await expect(panel.getByRole("link", { name: "Q3 budget.xlsx, File" })).toBeVisible()
      await shot(page, `folders-paths-1280-${theme}`)
    })

    test("a direct message that links here is named and opens in chat (DG6)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withDM, theme)
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      const row = panel.getByRole("link", { name: /A direct message from Maya Chen/ })
      await expect(row).toBeVisible({ timeout: 30_000 })
      await expect(row).toHaveAttribute("href", `/app/chat/${MAYA}/${DM}`)
      await expect(row).toContainText("Links here")
      await expect(row).not.toContainText("Links here · Maya Chen")
      await expect(panel.getByRole("radio", { name: "Direct messages" })).toBeVisible()
      await row.hover()
      await shot(page, `dm-1280-${theme}`)
    })

    test("loading, empty, failed and no-access each say what's true", async ({ page }, testInfo) => {
      let release: () => void = () => {}
      const held = new Promise<void>((r) => (release = r))
      await openDoc(page, testInfo, connected, theme, {}, (p) =>
        p.route("**/graph/connected**", async (route) => {
          await held
          await route.fulfill({ json: empty })
        }),
      )
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      await expect(panel.getByRole("status", { name: "Loading what this connects to" })).toBeVisible({ timeout: 30_000 })
      await shot(page, `loading-1280-${theme}`)
      release()
      await expect(panel.getByRole("heading", { name: "Nothing connected yet" })).toBeVisible()
      await shot(page, `empty-1280-${theme}`)
    })

    test("a failure offers Try again, and a hidden thing says so", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withStatus(503, { msg: "down" }), theme)
      await trigger(page).click()
      const panel = page.locator("[data-connected-panel]")
      await expect(panel.getByRole("button", { name: /Try again/ })).toBeVisible({ timeout: 30_000 })
      await expect(panel.getByText("Nothing connected yet")).toHaveCount(0)
      await shot(page, `error-1280-${theme}`)
    })

    test("a thing the reader can't see", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withStatus(404, { code: "not_found" }), theme)
      await trigger(page).click()
      await expect(page.locator("[data-connected-panel]").getByText("You can't see what this connects to")).toBeVisible({ timeout: 30_000 })
      // It can't be searched from, so it offers no search (DESIGN-BUILD-4).
      await expect(page.locator("[data-connected-panel]").getByRole("button", { name: "How is this connected to…" })).toHaveCount(0)
      // Nor a switch with nothing to switch (DESIGN-BUILD-5).
      await expect(page.locator("[data-connected-panel]").getByRole("radiogroup", { name: "How far to look" })).toHaveCount(0)
      // Open, the trigger is neutral: the ink press tint, never the accent.
      await expect(trigger(page)).toHaveAttribute("data-hue", "ink")
      await shot(page, `noaccess-1280-${theme}`)
    })
  })

  test.describe(`on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test("the panel is a sheet whose action stays in reach", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, connected, theme)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      const sheet = page.locator("[data-connected-panel]")
      await expect(sheet.getByRole("link", { name: /Autumn launch/ })).toBeVisible({ timeout: 30_000 })
      // The action is in the sheet's pinned footer, inside the screen.
      const find = sheet.locator("[data-sheet-footer]").getByRole("button", { name: "How is this connected to…" })
      await expect(find).toBeInViewport()
      await shot(page, `list-390-${theme}`)
      await find.tap()
      await sheet.getByRole("searchbox", { name: "Find something to connect to" }).fill("autumn")
      await sheet.getByRole("option", { name: /Autumn launch/ }).tap()
      await expect(sheet.locator("[data-graph-path]").first()).toBeVisible()
      await expect(sheet.locator("[data-sheet-footer]").getByRole("button", { name: "Back to connected" })).toBeInViewport()
      await shot(page, `paths-390-${theme}`)
    })

    test("a folder, a file and a link in the sheet, and a way through the folder (docs F1)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, inFolder, theme, folderAnswers)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      const sheet = page.locator("[data-connected-panel]")
      await expect(sheet.getByRole("link", { name: "Finance, Its folder" })).toBeVisible({ timeout: 30_000 })
      await expect(sheet.getByRole("link", { name: "Forecast, In this page" }).locator("[data-node-kind=link]")).toBeVisible()
      await expect(sheet.getByRole("link", { name: "Q3 budget.xlsx, In the same folder · via Finance" })).toHaveAttribute("data-hue", "moss")
      await shot(page, `folders-390-${theme}`)
      await sheet.locator("[data-sheet-footer]").getByRole("button", { name: "How is this connected to…" }).tap()
      await sheet.getByRole("searchbox", { name: "Find something to connect to" }).fill("autumn")
      await sheet.getByRole("option", { name: /Autumn launch/ }).tap()
      await expect(sheet.getByRole("link", { name: "Q3 budget.xlsx, File" })).toBeVisible()
      // The step's verb itself, not the screen reader's sentence that holds it.
      await expect(sheet.getByText("is in the folder", { exact: true })).toBeVisible()
      await shot(page, `folders-paths-390-${theme}`)
    })

    test("a direct message row in the sheet (DG6)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withDM, theme)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      const row = page.locator("[data-connected-panel]").getByRole("link", { name: /A direct message from Maya Chen/ })
      await row.scrollIntoViewIfNeeded()
      await expect(row).toBeVisible({ timeout: 30_000 })
      // The controls stay whole below the header while the list scrolls.
      const sheet = page.locator("[data-connected-panel]")
      const controls = sheet.locator("[data-connected-controls]")
      await expect(controls).toBeInViewport({ ratio: 1 })
      const head = await sheet.getByText("Launch film plan", { exact: true }).first().boundingBox()
      const bar = await controls.boundingBox()
      expect(head && bar && bar.y >= head.y + head.height).toBeTruthy()
      await shot(page, `dm-390-${theme}`)
    })

    test("a task's button comes from its own chunk at the bar's 44px, and opens the sheet", async ({ page }, testInfo) => {
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("ui-theme", t)
          localStorage.setItem("theme", t)
        } catch {}
      }, theme)
      await page.emulateMedia({ colorScheme: theme })
      await stubBackend(page, testInfo, { "/graph/connected": onTask })
      await page.goto(`/app/task/${TASK}`)
      const bar = page.locator("[data-phone-bar]")
      const button = bar.getByRole("button", { name: "Connected: what this connects to" })
      await expect(button).toBeVisible({ timeout: 30_000 })
      const box = await button.boundingBox()
      expect(box && [Math.round(box.width), Math.round(box.height)]).toEqual([44, 44])
      // Beside the task's options, as the bar's other actions sit.
      const options = await bar.getByRole("button", { name: "Task options" }).boundingBox()
      expect(box && options && Math.abs(box.y - options.y) < 1 && box.x < options.x).toBeTruthy()
      await button.tap()
      await expect(page.locator("[data-connected-panel]").getByRole("link", { name: /Launch film plan/ })).toBeVisible({ timeout: 30_000 })
      await shot(page, `task-390-${theme}`)
    })

    test("a meeting row fits the sheet and opens with a tap (DG13)", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withMeeting, theme)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      const row = page.locator("[data-connected-panel]").getByRole("link", { name: /^Weekly launch sync, Discussed this/ })
      await expect(row).toBeVisible({ timeout: 30_000 })
      const box = await row.boundingBox()
      expect(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= 390).toBeTruthy()
      await shot(page, `meeting-390-${theme}`)
    })

    test("its empty and failed states", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, empty, theme)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      await expect(page.locator("[data-connected-panel]").getByRole("heading", { name: "Nothing connected yet" })).toBeVisible({ timeout: 30_000 })
      await shot(page, `empty-390-${theme}`)
    })

    test("its failed state", async ({ page }, testInfo) => {
      await openDoc(page, testInfo, withStatus(503, { msg: "down" }), theme)
      await page.locator("[data-phone-bar]").getByRole("button", { name: "Connected: what this connects to" }).tap()
      await expect(page.locator("[data-connected-panel]").getByRole("button", { name: /Try again/ })).toBeVisible({ timeout: 30_000 })
      await shot(page, `error-390-${theme}`)
    })
  })
}
