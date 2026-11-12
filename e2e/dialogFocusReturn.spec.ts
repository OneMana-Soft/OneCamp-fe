import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { CollabRelay } from "./docs/collabRelay"
import { P, openBoard } from "./projectBoard"
import { SAM, TASK_PANEL_READS, docInfo, reviewShot, stubBackend } from "./stubbedApp"

// V-829: a dialog opened without a Radix Trigger gave the focus to <body> as it
// closed, so a keyboard started again at the top of the page. The overlay
// primitives now give it back to what opened it after a key that closes them
// (components/ui/returnFocus), and after a tap leave it where it is. Five
// dialogs opened with no Trigger, one from each place: a task's Who can see, a
// doc's Remind me (from its More menu; on a phone, Document options), the
// calendar's Add a calendar (from the Calendars popover), Settings' Add a
// label, and the board's Fields (from its Display menu). A dialog opened from
// a menu's or popover's row gives the focus back to that menu's or popover's
// button, the row having gone with it.
//
// At 1280 by keyboard: Escape, and Enter on Close, put the focus back on the
// opener with its ring showing. At 390 by touch: a tap opens it as a sheet,
// and a tap on Close leaves no text field focused (a phone would throw up its
// keyboard) and the page where it was.

const TASK = "00000000-0000-4000-8000-100000000000"
const DOC = "d1a10000-0000-4000-8000-0000000000a1"
const NOW = new Date(2026, 10, 5, 10, 0)

interface Place {
  /** Where the dialog is: the test's name. */
  from: string
  /** The dialog's accessible name. */
  dialog: string
  /** Its close button's name. */
  close: string
  /** Opens the page the dialog is on, stubbed, and waits for it. */
  go: (page: Page, testInfo: TestInfo, theme: "light" | "dark") => Promise<void>
  /** What the focus goes back to: the button, or the menu's button for a dialog a menu row opened. */
  opener: (page: Page, phone: boolean) => Locator
  /** The menu row that opens it, for a dialog opened from a menu or a phone's options sheet (else the opener itself opens it). */
  row?: (page: Page, phone: boolean) => Locator | undefined
}

const ADMIN = { ...SAM, user_is_admin: true }

const PLACES: Place[] = [
  {
    from: "a task",
    dialog: "Who can see this task",
    close: "Done",
    go: async (page, testInfo, theme) => {
      const task = { task_uuid: TASK, task_name: "Draft launch email", task_status: "todo", task_priority: "medium", task_project: { project_uuid: P, project_name: "Website relaunch", project_is_admin: true } }
      await openBoard(page, testInfo, theme, {
        ...TASK_PANEL_READS,
        [`/task/info/${TASK}`]: {
          msg: "ok",
          data: {
            ...task,
            task_label: "",
            task_due_date: "0001-01-01T00:00:00Z",
            task_start_date: "0001-01-01T00:00:00Z",
            task_created_at: "2026-10-01T09:00:00Z",
            task_deleted_at: "0001-01-01T00:00:00Z",
            task_assignee: SAM,
            task_created_by: SAM,
            task_description: "",
            task_sub_tasks: [],
            task_comments: [],
            task_activities: [],
            task_attachments: [],
            task_collaborators: [],
            task_blocked_by: [],
            task_blocks: [],
            task_access: { edit: true, delete: true, comment: true, log_time: true, restrict: true },
          },
        },
        "/restriction": { msg: "ok", data: { task_uuid: TASK, restricted: false, people: [], can_change: true } },
      })
      await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByRole("button", { name: /^Who can see this task:/ })).toBeVisible({ timeout: 60_000 })
    },
    opener: (page) => page.getByRole("button", { name: /^Who can see this task:/ }),
  },
  {
    from: "a doc",
    dialog: "Remind me",
    close: "Cancel",
    go: async (page, testInfo) => {
      // The doc page's other reads: the live editor's token, and no label on it.
      await stubBackend(page, testInfo, {
        [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch brief", edit: true }),
        "/auth/token": { data: { token: "e2e-sam" } },
        [`/labels/items/doc/${DOC}`]: { msg: "ok", data: null },
      })
      await new CollabRelay().attach(page, "Sam")
      await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByRole("textbox", { name: "Launch brief" })).toBeVisible({ timeout: 60_000 })
    },
    opener: (page, phone) => page.getByRole("button", { name: phone ? "Document options" : "More doc actions" }),
    row: (page, phone) => (phone ? page.getByRole("button", { name: /^Remind me/ }) : page.getByRole("menuitem", { name: /^Remind me/ })),
  },
  {
    from: "the calendar",
    dialog: "Add a calendar",
    close: "Close",
    go: async (page, testInfo) => {
      await page.clock.setFixedTime(NOW)
      await stubBackend(page, testInfo, {
        "/event/getEvents": { msg: "ok", data: [] },
        "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
        "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
        "/event/bookingPages": { msg: "ok", data: [] },
        "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
        "/calendar/subscriptions": { msg: "ok", data: [] },
        "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
      })
      await page.goto("/app/calendar?date=2026-11-05&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator("[data-period]")).toBeVisible({ timeout: 120_000 })
    },
    // A row of the Calendars popover, which closes as the dialog opens; on a phone, of the calendar's options sheet.
    opener: (page, phone) => page.getByRole("button", phone ? { name: "Calendar options" } : { name: /^Calendars/ }),
    row: (page, phone) => (phone ? page.getByRole("button", { name: "Subscribe to a calendar" }) : page.locator("[data-calendars-panel]").getByRole("button", { name: "Subscribe to a calendar" })),
  },
  {
    from: "Settings",
    dialog: "Add a label",
    close: "Close",
    go: async (page, testInfo) => {
      await stubBackend(page, testInfo, {
        "/user/profile": { msg: "ok", data: ADMIN },
        "/labels": { msg: "ok", data: { labels: [], rules: [{ key: "no_guest_links", name: "No guest links" }] } },
        "/admin/labels": { msg: "ok", data: null },
        // The tab's guest access card reads the workspace's settings (guest links off) and the guest links (none).
        "/admin/settings": { msg: "ok", data: { upload_limit_mb: 25, upload_limit_source: "default", allowed_users: [], allowed_users_source: "default", has_resend_api_key: false, resend_source: "none", guest_access_enabled: false } },
        "/admin/guest-grants": { msg: "ok", data: [] },
      })
      await page.goto("/app/admin?tab=security", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const add = page.locator("#security-labels").getByRole("button", { name: "Add a label" })
      await expect(add).toBeVisible({ timeout: 60_000 })
      await add.scrollIntoViewIfNeeded()
    },
    opener: (page) => page.locator("#security-labels").getByRole("button", { name: "Add a label" }),
  },
  {
    from: "the board",
    dialog: "Fields",
    close: "Close",
    go: async (page, testInfo, theme) => {
      await openBoard(page, testInfo, theme)
    },
    opener: (page) => page.getByRole("button", { name: "Display", exact: true }),
    row: (page) => page.getByRole("menuitem", { name: "Manage fields…" }),
  },
]

/** Opens it from the keys: Enter on its button, or on the menu's button and then on the row. */
async function openWithKeys(page: Page, place: Place) {
  const opener = place.opener(page, false)
  await opener.focus()
  await page.keyboard.press("Enter")
  const row = place.row?.(page, false)
  if (row) {
    await expect(row).toBeVisible()
    await row.focus()
    await page.keyboard.press("Enter")
  }
  const dialog = page.getByRole("dialog", { name: place.dialog })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  if (row) {
    // The menu or popover is gone, its own give-back to its button done (the
    // dialog's trap took the focus back), so what comes back on close is the
    // dialog's doing.
    await expect(row).toBeHidden()
    await page.waitForTimeout(200)
  }
  await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  return dialog
}

/** The focus is back on what opened it, its ring showing. */
async function focusIsBack(page: Page, place: Place) {
  const opener = place.opener(page, false)
  await expect(opener, `${place.dialog}: the focus is back on what opened it`).toBeFocused()
  await expect.poll(() => opener.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
}

/** Opens it by touch: a tap on its button, or on the options' button and then on the row. */
async function openWithTaps(page: Page, place: Place) {
  await place.opener(page, true).tap({ timeout: 60_000 })
  await place.row?.(page, true)?.tap()
  const dialog = page.getByRole("dialog", { name: place.dialog })
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  return dialog
}

/** Whether a text field has the focus (a phone would raise its keyboard for one). */
const fieldFocused = (page: Page) =>
  page.evaluate(() => {
    const at = document.activeElement as HTMLElement | null
    return !!at && (at.matches("input:not([type=button]):not([type=checkbox]):not([type=radio]), textarea, select") || at.isContentEditable)
  })

/**
 * Its y once it stands still: two reads 250 ms apart agree. A task's page can
 * still grow above its button just after the button shows (441 then 593, on
 * web beta a71ea08cf too), which is the page loading, not the tap on Close.
 */
async function stillY(locator: Locator) {
  let y: number | undefined = -1
  let last: number | undefined
  await expect.poll(async () => {
    last = y
    y = (await locator.boundingBox())?.y
    return y === last
  }, { intervals: [250] }).toBe(true)
  return y
}

const slug = (place: Place) => place.from.replace(/\W+/g, "-").replace(/^-|-$/g, "").toLowerCase()

for (const theme of ["light", "dark"] as const) {
  test.describe(`a dialog opened with no trigger, at 1280 by keyboard, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    for (const place of PLACES) {
      test(`from ${place.from}: Escape and Enter on Close give the focus back to what opened ${place.dialog}`, async ({ page }, testInfo) => {
        // V-870, older than V-829 (as often on web beta a71ea08cf): opened from
        // the More menu by key, Remind me's When field takes the focus before
        // the dialog's trap listens, so the fading menu can give it to More,
        // behind the open dialog. Its Escape and Close are walked again when
        // V-870 is fixed; at 390 by touch the doc is walked below.
        test.fixme(place.from === "a doc", "V-870: Remind me opened by key can leave the focus behind it (web beta too)")
        test.setTimeout(240_000)
        await place.go(page, testInfo, theme)

        let dialog = await openWithKeys(page, place)
        await page.keyboard.press("Escape")
        await expect(dialog).toHaveCount(0)
        await focusIsBack(page, place)
        await reviewShot(page, `focus-back-${slug(place)}-escape`, theme)

        dialog = await openWithKeys(page, place)
        await dialog.getByRole("button", { name: place.close, exact: true }).last().focus()
        await page.keyboard.press("Enter")
        await expect(dialog).toHaveCount(0)
        await focusIsBack(page, place)
      })
    }
  })

  test.describe(`a dialog opened with no trigger, at 390 by touch, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    for (const place of PLACES) {
      test(`from ${place.from}: a tap opens ${place.dialog} as a sheet, and a tap on Close leaves no field focused and the page where it was`, async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await place.go(page, testInfo, theme)
        // Where the page is: its opener's place on the screen (the app scrolls in its own panes, not the window).
        const opener = place.opener(page, true)
        const was = await stillY(opener)
        const dialog = await openWithTaps(page, place)
        // A sheet: a dialog drawn as one, or a ResponsiveDialog's drawer.
        expect(await dialog.evaluate((el) => el.matches("[data-v3-sheet], [data-overlay=sheet]")), "it opens as a sheet").toBe(true)
        await reviewShot(page, `focus-back-${slug(place)}-sheet-open`, theme)
        await dialog.getByRole("button", { name: place.close, exact: true }).last().tap()
        await expect(dialog).toHaveCount(0)
        // A task later: Radix gives the focus as the overlay's scope unmounts.
        await page.waitForTimeout(300)
        expect(await fieldFocused(page), "no text field has the focus").toBe(false)
        expect((await opener.boundingBox())?.y, "the page is where it was").toBe(was)
        await reviewShot(page, `focus-back-${slug(place)}-sheet-closed`, theme)
      })
    }
  })
}
