import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"
import { docInfo, stubBackend } from "./stubbedApp"

// Split view, rearranged (20 Oct 2026; release-1010/design/split/ANALYSIS.md):
// a view moves by dragging its bar (the page by the grip at its top), by
// Ctrl+Alt+Shift+[ ] or its menu, with Undo; the seams resize by pointer and
// keys, a double-click evens the views out; as many views as the width holds
// (360px each), the least recently used closing to make room, with Undo; an
// item open twice comes forward instead; a narrower window tucks views away;
// the layout comes back after a reload; and a phone never splits.

const A = "d0c00000-0000-4000-8000-0000000000a1"
const B = "d0c00000-0000-4000-8000-0000000000b2"
const C = "d0c00000-0000-4000-8000-0000000000c3"
const doc = (id: string) => ({ kind: "doc", id })
const key = (id: string) => `doc:${id}`

async function open(page: Page, testInfo: TestInfo, path: string, panes: string[]) {
  await stubBackend(page, testInfo, {
    [`/doc/getDocInfo/${A}`]: docInfo({ doc_uuid: A, doc_title: "Launch plan" }),
    [`/doc/getDocInfo/${B}`]: docInfo({ doc_uuid: B, doc_title: "Pricing notes" }),
    [`/doc/getDocInfo/${C}`]: docInfo({ doc_uuid: C, doc_title: "Retro notes" }),
    // The docs' access and the editor's token: left to the 404, a "Not found"
    // toast came over the Undo of the toast under it.
    "/doc/access/": (url: URL) => ({ data: { doc_uuid: url.pathname.split("/").pop(), level: "comment", owner: false, lock: "", locked: false, can_share: false, can_lock_soft: false, can_lock_hard: false } }),
    "/auth/token": { data: { token: "e2e-sam" } },
  })
  // The layout a browser kept, for a new tab: a reload keeps the tab's own.
  await page.addInitScript((kept) => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
      if (!sessionStorage.getItem("oc_split_layout")) localStorage.setItem("oc_split_layout", kept)
    } catch {
      /* storage blocked */
    }
  }, JSON.stringify({ panes: panes.map(doc), order: [], sizes: {} }))
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const sheet = (page: Page, k: string) => page.locator(`[data-split-sheet="${k}"]`)
const handle = (page: Page, k: string) => page.locator(`[data-split-handle="${k}"] [data-drag-handle]`)
const box = async (l: Locator) => (await l.boundingBox())!
/**
 * The views left to right, by where their sheets are, in one read of the page
 * (a box per view waited on each sheet, and on a loaded machine the poll timed
 * out inside its first try).
 */
const row = (page: Page, keys: string[]) =>
  page.evaluate(
    (keys) =>
      keys
        .map((k) => [k, document.querySelector(`[data-split-sheet="${k}"]`)?.getBoundingClientRect().left ?? Infinity] as const)
        .sort((a, b) => a[1] - b[1])
        .map(([k]) => k),
    keys,
  )

/** Drags from one point to another as a hand would, in steps. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, mid?: () => Promise<void>) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 14 })
  if (mid) await mid()
  await page.mouse.up()
}

test.describe("on a computer", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test("a pane dragged by its bar to the page's left stays there, and after a reload", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A])
    await expect(handle(page, key(A))).toBeAttached({ timeout: 90_000 })
    expect(await row(page, ["main", key(A)])).toEqual(["main", key(A)])

    const from = await box(handle(page, key(A)))
    const main = await box(sheet(page, "main"))
    // The carry's marks are there before it, in their own layer, and only shown (fluid-21).
    const marks = () => page.evaluate(() => document.querySelector(".split-layer")?.childElementCount ?? 0)
    const before = await marks()
    expect(before).toBeGreaterThan(0)
    await drag(page, { x: from.x + 60, y: from.y + from.height / 2 }, { x: main.x + main.width * 0.1, y: main.y + main.height / 2 }, async () => {
      // Mid-drag: the line where it will land with the column it drafts there, and the slot it left.
      await expect(page.locator('[data-drop-line="col"]')).toBeVisible()
      await expect(page.locator(".split-drop-slot")).toBeVisible()
      await expect(page.locator(".split-held")).toBeVisible()
      await expect(sheet(page, key(A))).toHaveAttribute("data-split-held", "")
      // Drawn by their own rules, as the build has them (a stale stylesheet showed every mark at once).
      await expect(page.locator(".split-drop-swap")).toBeHidden()
      expect(await page.locator(".split-held").evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).outlineStyle])).toEqual(["fixed", "dashed"])
      expect(await sheet(page, key(A)).evaluate((el) => getComputedStyle(el).opacity)).toBe("0")
      expect(await marks()).toBe(before)
      // The cursor is on the carry's surface, under the pointer (lib/ui/dnd DRAG_OVERLAY).
      expect(await page.locator(".split-carry").evaluate((el) => [el.classList.contains("ix-drag-overlay"), getComputedStyle(el).position, getComputedStyle(el).cursor])).toEqual([true, "fixed", "grabbing"])
    })
    await expect(page.locator(".split-carry")).toBeHidden()
    await expect(sheet(page, key(A))).not.toHaveAttribute("data-split-held", "")
    await expect.poll(() => row(page, ["main", key(A)])).toEqual([key(A), "main"])
    // Named as its own view loaded it, never by its kind ("Moved Doc", 21 Oct).
    await expect(page.getByText("Moved Launch plan", { exact: true })).toBeVisible()
    await expect(page.getByRole("region", { name: "Launch plan, view 1 of 2" })).toBeVisible()
    // A pointer's move leaves no ring on the view it moved: only the keys' do.
    expect(await page.evaluate(() => !!document.querySelector("[data-split-handle] :focus-visible"))).toBe(false)

    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(sheet(page, key(A))).toBeVisible({ timeout: 90_000 })
    expect(await row(page, ["main", key(A)])).toEqual([key(A), "main"])
  })

  test("the page dragged by its grip onto a pane's middle swaps places with it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A, B])
    await expect(handle(page, "main")).toBeAttached({ timeout: 90_000 })
    const grip = await box(handle(page, "main"))
    const target = await box(sheet(page, key(B)))
    await drag(page, { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }, { x: target.x + target.width / 2, y: target.y + target.height / 2 }, async () => {
      await expect(page.locator(".split-drop-swap")).toBeVisible()
    })
    await expect.poll(() => row(page, ["main", key(A), key(B)])).toEqual([key(B), key(A), "main"])
  })

  test("the keys move a view, as its menu does, with Undo; Space carries it too", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A, B])
    await expect(handle(page, key(B))).toBeAttached({ timeout: 90_000 })
    const views = ["main", key(A), key(B)]

    // The shortcut moves the view the keys act on.
    await handle(page, key(B)).focus()
    await page.keyboard.press("Control+Alt+Shift+BracketLeft")
    await expect.poll(() => row(page, views)).toEqual(["main", key(B), key(A)])

    // Its menu's Move left, then Undo puts it back.
    await sheet(page, key(B)).getByRole("button", { name: /^More for this doc/ }).click()
    await page.getByRole("menuitem", { name: "Move left" }).click()
    await expect.poll(() => row(page, views)).toEqual([key(B), "main", key(A)])
    await page.getByRole("button", { name: "Undo" }).last().click()
    await expect.poll(() => row(page, views)).toEqual(["main", key(B), key(A)])

    // Space lifts it, the arrows walk it (its place, then the line before it),
    // Space puts it down. The lift measures where the views are, so it waits
    // for the swap target to stop moving: the Undo slides the views into their
    // places, and a lift mid-slide measured the target where it had been, so the
    // first arrow went past its place to the line before it.
    await page.waitForFunction(() =>
      [...document.querySelectorAll("[data-split-row] [data-flip-id]")].every((el) => el.getAnimations().every((a) => a.playState !== "running")),
    )
    await handle(page, key(A)).focus()
    await page.keyboard.press("Space")
    await expect(page.locator("html")).toHaveAttribute("data-dragging", "true")
    // The ghost starts on the view's bar, not in the window's corner.
    expect((await box(page.locator(".split-ghost"))).x).toBeGreaterThan((await box(sheet(page, key(A)))).x)
    // @dnd-kit's keyboard sensor starts listening on a timer it sets at the
    // lift, so the keys wait for a timer set after it (150 ms wasn't always enough).
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
    await page.keyboard.press("ArrowLeft")
    await expect(page.locator(".split-drop-swap")).toBeVisible()
    await page.keyboard.press("ArrowLeft")
    await expect(page.locator('[data-drop-line="col"]')).toBeVisible()
    await page.keyboard.press("Space")
    await expect.poll(() => row(page, views)).toEqual(["main", key(A), key(B)])
  })

  test("a seam resizes by pointer and keys, a double-click evens the views, and the widths come back after a reload", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A])
    const seam = page.getByRole("separator", { name: "Resize views 1 and 2" })
    await expect(seam).toBeVisible({ timeout: 90_000 })
    const before = (await box(sheet(page, "main"))).width

    const s = await box(seam)
    await drag(page, { x: s.x + s.width / 2, y: s.y + s.height / 2 }, { x: s.x - 200, y: s.y + s.height / 2 }, async () => {
      // Off the seam, a surface over the page wears its cursor, as the build draws it.
      expect(await page.locator(".shell-seam-surface").evaluate((el) => [getComputedStyle(el).position, getComputedStyle(el).cursor])).toEqual(["fixed", "col-resize"])
    })
    await expect.poll(async () => Math.round(before - (await box(sheet(page, "main"))).width)).toBeGreaterThan(150)
    // Gone with the release: a press alone lays nothing over the seam, so the double-click below lands on it.
    await expect(page.locator(".shell-seam-surface")).toHaveCount(0)

    const narrow = (await box(sheet(page, "main"))).width
    await seam.focus()
    await page.keyboard.press("ArrowRight")
    await expect.poll(async () => Math.round((await box(sheet(page, "main"))).width - narrow)).toBeGreaterThan(20)

    await seam.dblclick()
    await expect.poll(async () => Math.abs((await box(sheet(page, "main"))).width - (await box(sheet(page, key(A)))).width)).toBeLessThan(4)

    // Dragged wide again, kept, and back after a reload.
    const t = await box(seam)
    await drag(page, { x: t.x + t.width / 2, y: t.y + t.height / 2 }, { x: t.x + 160, y: t.y + t.height / 2 })
    const wide = (await box(sheet(page, "main"))).width
    await page.waitForTimeout(600)
    await page.reload({ waitUntil: "domcontentloaded" })
    await expect(sheet(page, key(A))).toBeVisible({ timeout: 90_000 })
    await expect.poll(async () => Math.abs((await box(sheet(page, "main"))).width - wide)).toBeLessThan(6)
  })

  test("an item already open beside comes forward instead of opening again", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A])
    await expect(handle(page, key(A))).toBeAttached({ timeout: 90_000 })
    // A link to it, as a message or a row would carry, Alt-clicked.
    await page.evaluate((href) => {
      const a = document.createElement("a")
      a.href = href
      a.textContent = "the launch plan"
      a.dataset.probe = ""
      document.querySelector("[data-split-view='-1']")?.prepend(a)
    }, `/app/doc/${A}`)
    await page.locator("a[data-probe]").click({ modifiers: ["Alt"] })
    await expect(page.locator("section[data-split-view]")).toHaveCount(1)
    await expect.poll(() => page.evaluate((k) => !!document.activeElement?.closest(`[data-split-sheet="${k}"]`), key(A))).toBe(true)
    expect(new URL(page.url()).pathname).toBe("/app/home")
  })

  test("a narrower window tucks a view away, and its chip brings it back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A, B])
    await expect(sheet(page, key(B))).toBeVisible({ timeout: 90_000 })
    await expect(page.locator("section[data-split-view]:visible")).toHaveCount(2)
    await page.setViewportSize({ width: 1100, height: 900 })
    await expect(page.locator("section[data-split-view]:visible")).toHaveCount(1)
    const chip = page.locator("[data-split-tucked] button").first()
    await expect(chip).toBeVisible()
    await expect(chip).toHaveAccessibleName(/^Bring back (Launch plan|Pricing notes)$/)
    await chip.click()
    await expect(page.locator("[data-split-tucked] button")).toHaveCount(1)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.locator("section[data-split-view]:visible")).toHaveCount(2)
  })
})

test.describe("at 1280, one side view fits", () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test("opening another closes the least recently used, with an Undo that puts it back", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, `/app/doc/${B}`, [A])
    await expect(sheet(page, key(A))).toBeVisible({ timeout: 90_000 })
    // Its view has loaded its name (a view closed before then goes by its kind).
    await expect(sheet(page, key(A)).locator(".split-bar")).toContainText("Launch plan", { timeout: 60_000 })
    // This page, opened beside (Ctrl+Alt+\): no room for two side views here.
    await page.keyboard.press("Control+Alt+Backslash")
    await expect(sheet(page, key(B))).toBeVisible()
    await expect(sheet(page, key(A))).toHaveCount(0)
    await expect(page.getByText("Closed Launch plan to make room", { exact: true })).toBeVisible()
    await page.getByRole("button", { name: "Undo" }).last().click()
    await expect(sheet(page, key(A))).toBeVisible()
    await expect(page.locator(`section[data-split-sheet="${key(B)}"]`)).toHaveCount(0)
  })
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("never splits: views kept on a computer don't draw, and a link opens its page", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/home", [A, C])
    await page.waitForLoadState("networkidle").catch(() => {})
    await expect(page.locator("section[data-split-view]")).toHaveCount(0)
    await page.evaluate((href) => {
      const a = document.createElement("a")
      a.href = href
      a.textContent = "the launch plan"
      a.dataset.probe = ""
      document.body.prepend(a)
    }, `/app/doc/${A}`)
    await page.locator("a[data-probe]").click({ modifiers: ["Alt"] })
    await expect(page).toHaveURL(new RegExp(`/app/doc/${A}$`))
    await expect(page.locator("section[data-split-view]")).toHaveCount(0)
  })
})
