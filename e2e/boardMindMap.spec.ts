import { expect, test, type Page } from "@playwright/test"
import { USERS, fakeApp, status } from "../scripts/fluidity/fakeApp.mjs"
import { BOARD, DEVICES, GREEN, NAME, TOKEN, connected, deleted, drawnAnywhere, el, mapBoard, mind, nodes, openMember, posts, pressAt, server, wordsOf, type Board, type Shared } from "./mindMapKit"

// miro-15 "Mind maps": a map grows with Tab and Enter and lays itself out on every change; a folded branch leaves the
// drawing (the board's one scene filter), Find and a share link's guest, with a badge counting it; a phone's bar has
// Add child, Add sibling and Fold at 44 px; a viewer sees the map with no mind map actions.

/** e2e :71's keys: a new map's root, Tab a child, Enter ends its words, Enter a sibling, Escape; 3 nodes on the server. */
async function growByKeys(page: Page, on: Board, timeout = 5_000) {
  await page.getByRole("button", { name: "Mind map", exact: true }).click()
  const words = page.locator("textarea.excalidraw-wysiwyg")
  await expect(words).toBeFocused({ timeout })
  await page.keyboard.type("Launch")
  await page.keyboard.press("Tab")
  await expect(words).toBeFocused({ timeout })
  await expect(words).toHaveValue("", { timeout })
  await page.keyboard.type("Site")
  await page.keyboard.press("Enter")
  await expect(words).toHaveCount(0, { timeout })
  await page.keyboard.press("Enter")
  await expect(words).toBeFocused({ timeout })
  await page.keyboard.type("Press")
  await page.keyboard.press("Escape")
  await expect.poll(() => nodes(on).length, { timeout }).toBe(3)
}

test.describe("mind maps", () => {
  test("a computer grows a map with Tab and Enter, laid out on every change", async ({ browser }) => {
    const on = mapBoard([])
    const { context, page } = await openMember(browser, "computer", on)
    await growByKeys(page, on)
    const all = nodes(on)
    const root = all.find((e) => e.customData!.mindMap!.parent === null)!
    expect(wordsOf(on, root.id)).toBe("Launch")
    const kids = all.filter((e) => e.customData!.mindMap!.parent === root.id).sort((a, b) => a.y - b.y)
    expect(kids.map((k) => wordsOf(on, k.id))).toEqual(["Site", "Press"])
    for (const k of kids) expect(k.x).toBeGreaterThan(root.x + root.width)
    // Excalidraw's own Enter on an ordinary shape still opens its words: the keys are a mind map node's only.
    await context.close()
  })

  // CR-421 F5: Tab and Enter handed off to React and Excalidraw on timers, so on a slow phone or a busy board the
  // words took a new line or lost what was typed (:71's steps failed 5 of 6 at CPU x4 and x8).
  for (const rate of [4, 8])
    for (const n of [1, 2, 3])
      test(`Tab and Enter keep up with a slow computer: CPU x${rate}, run ${n}`, async ({ browser }) => {
        test.setTimeout(240_000)
        const on = mapBoard([])
        const { context, page } = await openMember(browser, "computer", on)
        const cdp = await context.newCDPSession(page)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
        await growByKeys(page, on, 30_000)
        const root = nodes(on).find((e) => e.customData!.mindMap!.parent === null)!
        expect(wordsOf(on, root.id)).toBe("Launch")
        const kids = nodes(on).filter((e) => e.customData!.mindMap!.parent === root.id)
        expect(kids.map((k) => wordsOf(on, k.id)).sort()).toEqual(["Press", "Site"])
        await context.close()
      })

  test("More, Delete branch on a folded node takes the whole branch, its connectors and their words; the Delete key too", async ({ browser }) => {
    const on = mapBoard(connected())
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const branch = ["a", "a-label", "a1", "a1-label", "a2", "a2-label", "e-a", "e-a1", "e-a1-label", "e-a2"]
    const rest = ["root", "root-label", "b", "b-label", "e-b"]
    const bar = page.locator("[data-mind-map-bar]")
    await pressAt(page, "computer", 260, 180)
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await bar.getByRole("button", { name: "More", exact: true }).click()
    await page.locator("[data-mind-map-more]").getByRole("button", { name: "Delete branch" }).click()
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => true))
    expect(deleted(on, rest)()).toEqual(rest.map(() => false))
    // The bar moves on to the parent, and More goes with the deleted node: nothing of it stays over the board.
    await expect(page.locator("[data-mind-map-more]")).toHaveCount(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => false))
    await pressAt(page, "computer", 260, 180)
    await expect(bar.getByRole("button", { name: "Add child", exact: true })).toBeVisible()
    await page.keyboard.press("Delete")
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => true))
    expect(deleted(on, rest)()).toEqual(rest.map(() => false))
    await context.close()
  })

  // The steps of the probe that found it (WB-179, CR-420 F2), with no wait between them: More stayed open over the
  // board after Delete branch took its node, so the re-select's press landed in it and the Delete key went nowhere.
  // More is counted the moment Delete branch is done, as the probe read it, not after a wait that lets it close.
  test("Delete branch from More, then Undo, re-select and the Delete key at once: More has gone and the key takes the branch", async ({ browser }) => {
    const on = mapBoard(connected())
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const branch = ["a", "a-label", "a1", "a1-label", "a2", "a2-label", "e-a", "e-a1", "e-a1-label", "e-a2"]
    const rest = ["root", "root-label", "b", "b-label", "e-b"]
    const bar = page.locator("[data-mind-map-bar]")
    await pressAt(page, "computer", 260, 180)
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await bar.getByRole("button", { name: "More", exact: true }).click()
    await page.locator("[data-mind-map-more]").getByRole("button", { name: "Delete branch" }).click()
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => true))
    expect(await page.locator("[data-mind-map-more]").count()).toBe(0)
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => false))
    await pressAt(page, "computer", 260, 180)
    await expect(bar.getByRole("button", { name: "Add child", exact: true })).toBeVisible()
    await page.keyboard.press("Delete")
    await expect.poll(deleted(on, branch)).toEqual(branch.map(() => true))
    expect(deleted(on, rest)()).toEqual(rest.map(() => false))
    await context.close()
  })

  test("a teammate folds a branch while another types a node's words in it: the words survive (CR-420 V4)", async ({ browser }) => {
    test.setTimeout(120_000)
    const on = mapBoard(connected())
    const A = await openMember(browser, "computer", on)
    const B = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(A.page, GREEN)).toBe(true)
    await expect.poll(() => drawnAnywhere(B.page, GREEN)).toBe(true)
    const folded = () => el(on, "a")?.customData?.mindMap?.folded ?? false
    // B opens a1's words and types its first letter.
    await pressAt(B.page, "computer", 440, 180)
    await expect(B.page.locator("[data-mind-map-bar]").getByRole("button", { name: "Add child", exact: true })).toBeVisible()
    await B.page.keyboard.press("Z")
    const words = B.page.locator("textarea.excalidraw-wysiwyg")
    await expect(words).toHaveValue("Z")
    await expect.poll(() => wordsOf(on, "a1")).toBe("Z")
    // A folds a meanwhile; B goes on typing, then ends its words.
    await pressAt(A.page, "computer", 260, 180)
    await A.page.locator("[data-mind-map-bar]").getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(folded).toBe(true)
    await B.page.waitForTimeout(800)
    await B.page.keyboard.type("ed")
    await B.page.keyboard.press("Escape")
    await B.page.waitForTimeout(1_000)
    // A opens the fold again: what B typed is there, in the document.
    await pressAt(A.page, "computer", 260, 180)
    await A.page.locator("[data-mind-map-bar]").getByRole("button", { name: "Unfold", exact: true }).click()
    await expect.poll(folded).toBe(false)
    expect(deleted(on, ["a1", "a1-label"])()).toEqual([false, false])
    await expect.poll(() => wordsOf(on, "a1")).toBe("Zed")
    await A.context.close()
    await B.context.close()
  })

  test("More, Make tasks makes the branch's worded ideas tasks in one request, in tree order, each node keeping its task", async ({ browser }) => {
    const on = mapBoard([...mind("root", 20, 200, "Launch", null), ...mind("a", 200, 120, "Site", "root"), ...mind("a1", 380, 120, "Copy", "a", "#0CA678"), ...mind("a2", 380, 260, "", "a"), ...mind("b", 200, 300, "Press", "root")])
    const UUIDS = ["7a5c0000-0000-4000-8000-000000000000", "7a5c0000-0000-4000-8000-000000000001"]
    const made = posts((sent) => ({ msg: "ok", data: { made: (sent.tasks as unknown[]).map((_, i) => UUIDS[i]) } }))
    const project = { project_uuid: "0c0a0000-0000-4000-8000-0000000000a1", project_name: "Launch" }
    const { context, page } = await openMember(browser, "computer", on, USERS.sam, [
      [/\/project\/projectListByAdminUID$/, { msg: "ok", data: [project] }],
      [/\/task\/createTasks$/, made.answer],
    ])
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await pressAt(page, "computer", 260, 180)
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "More", exact: true }).click()
    // CR-421 N4: the label counts what the dialog makes, the ideas with words (a2 has none).
    const make = page.locator("[data-mind-map-more]").getByRole("button", { name: /^Make (a task|\d+ tasks)$/ })
    await expect(make).toHaveText("Make 2 tasks")
    await make.click()
    const dialog = page.getByRole("dialog").last()
    await dialog.getByRole("combobox", { name: "Project" }).click()
    await page.getByRole("option", { name: "Launch" }).click()
    await dialog.getByRole("button", { name: "Make 2 tasks" }).click()
    await expect(page.getByText(/^Made 2 tasks$/)).toBeVisible()
    expect(made.sent).toEqual([{ project_uuid: project.project_uuid, tasks: [{ task_name: "Site" }, { task_name: "Copy" }] }])
    await expect.poll(() => ["a", "a1"].map((id) => el(on, id)?.customData?.taskUuid ?? null)).toEqual(UUIDS)
    await context.close()
  })

  test("More, Make a doc writes the branch's outline into a new private doc, and trashes the doc when the outline can't be written", async ({ browser }) => {
    const on = mapBoard()
    const DOC = "d0c00000-0000-4000-8000-0000000000d1"
    const created = posts(() => ({ msg: "ok", data: { doc_uuid: DOC } }))
    const written = posts((_sent, n) => (n === 1 ? { msg: "ok" } : status(500, { msg: "The doc store is down." })))
    const trashed = posts(() => ({ msg: "ok", data: {} }))
    const { context, page } = await openMember(browser, "computer", on, USERS.sam, [
      [/\/doc\/createDoc$/, created.answer],
      [/\/doc\/updateDoc$/, written.answer],
      [/\/doc\/delete$/, trashed.answer],
    ])
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await pressAt(page, "computer", 260, 180)
    const more = page.locator("[data-mind-map-more]")
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "More", exact: true }).click()
    await more.getByRole("button", { name: "Make a doc" }).click()
    await expect(page.getByRole("link", { name: "Open the outline" })).toBeVisible()
    expect(created.sent).toEqual([{ doc_title: "Site", doc_private: true }])
    expect(written.sent.map((w) => w.doc_uuid)).toEqual([DOC])
    expect(String(written.sent[0].doc_body)).toMatch(/Site[\s\S]*Copy/)
    expect(String(written.sent[0].doc_body)).not.toMatch(/Press|Launch/)
    expect(trashed.sent).toEqual([])
    // The outline's write fails: the new doc goes to the trash (the soft delete), and the person is told.
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "More", exact: true }).click()
    await more.getByRole("button", { name: "Make a doc" }).click()
    await expect(page.getByText("The doc store is down.")).toBeVisible()
    await expect.poll(() => trashed.sent).toEqual([{ doc_uuid: DOC }])
    expect(written.sent).toHaveLength(2)
    await context.close()
  })

  test("folding a branch hides it from the drawing and Find, with a badge; delete takes the branch and undo brings it back", async ({ browser }) => {
    const on = mapBoard()
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await pressAt(page, "computer", 260, 180)
    const bar = page.locator("[data-mind-map-bar]")
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await expect(page.locator("[data-mind-map-folded]")).toHaveText("+1")
    await expect.poll(() => server(on)().find((e) => e.id === "a")?.customData?.mindMap?.folded).toBe(true)
    expect(server(on)().find((e) => e.id === "a1")?.isDeleted).toBeFalsy()
    await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
    await page.getByRole("menuitem", { name: "Find and replace" }).click()
    await page.getByRole("textbox", { name: "Find on board" }).fill("Copy")
    await expect(page.getByText("Nothing on this board says that.")).toBeVisible()
    await page.keyboard.press("Escape")
    await pressAt(page, "computer", 260, 180)
    await bar.getByRole("button", { name: "Unfold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await page.keyboard.press("Delete")
    await expect.poll(() => ["a", "a1"].map((id) => server(on)().find((e) => e.id === id)?.isDeleted)).toEqual([true, true])
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(() => ["a", "a1"].map((id) => server(on)().find((e) => e.id === id)?.isDeleted ?? false)).toEqual([false, false])
    await context.close()
  })

  test("deleting a folded node takes the branch its folds hide, nested ones too, and one undo brings it all back", async ({ browser }) => {
    const on = mapBoard([...mind("root", 20, 200, "Launch", null), ...mind("a", 200, 120, "Site", "root"), ...mind("a1", 380, 120, "Copy", "a", "#0CA678"), ...mind("a2", 560, 120, "Brief", "a1"), ...mind("b", 200, 300, "Press", "root")])
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const branch = ["a", "a-label", "a1", "a1-label", "a2", "a2-label"]
    const deleted = () => branch.map((id) => server(on)().find((e) => e.id === id)?.isDeleted ?? false)
    const folded = () => ["a", "a1"].map((id) => server(on)().find((e) => e.id === id)?.customData?.mindMap?.folded ?? false)
    const bar = page.locator("[data-mind-map-bar]")
    // a1 folded inside a folded a: the delete opens both folds first, outside undo.
    await pressAt(page, "computer", 440, 180)
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(folded).toEqual([false, true])
    await page.keyboard.press("Escape")
    await pressAt(page, "computer", 260, 180)
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await expect.poll(folded).toEqual([true, true])
    await page.keyboard.press("Delete")
    await expect.poll(deleted).toEqual(branch.map(() => true))
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted).toEqual(branch.map(() => false))
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect.poll(deleted).toEqual(branch.map(() => true))
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted).toEqual(branch.map(() => false))
    // The next undo takes back a's fold: the branch stays open (opening the folds was never a step). Nothing to wait on.
    await page.keyboard.press("ControlOrMeta+z")
    await page.waitForTimeout(1_000)
    expect(folded()).toEqual([false, false])
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await context.close()
  })

  test("Excalidraw's own delete of a folded node, from its menu or select all, keeps the hidden branch out of sight, and undo brings it back folded", async ({ browser }) => {
    const on = mapBoard()
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const branch = ["a", "a-label", "a1", "a1-label"]
    const deleted = () => branch.map((id) => server(on)().find((e) => e.id === id)?.isDeleted ?? false)
    const folded = () => server(on)().find((e) => e.id === "a")?.customData?.mindMap?.folded ?? false
    // What the document keeps of the hidden branch, for the record.
    const probe = (how: string) => console.log(`PROBE-A ${how}: ${branch.join(",")} isDeleted ${JSON.stringify(deleted())}`)
    await pressAt(page, "computer", 260, 180)
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(folded).toBe(true)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    // Its context menu's Delete: Excalidraw's own action, past the mind map's keys.
    const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
    await page.mouse.click(canvas.x + 260, canvas.y + 180, { button: "right" })
    await page.locator(".context-menu .context-menu-item__label", { hasText: /^Delete$/ }).click()
    await expect.poll(() => deleted().slice(0, 2)).toEqual([true, true])
    probe("context menu")
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted).toEqual([false, false, false, false])
    await expect.poll(folded).toBe(true)
    await expect(page.locator("[data-mind-map-folded]")).toHaveText("+1")
    expect(await drawnAnywhere(page, GREEN)).toBe(false)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect.poll(() => deleted().slice(0, 2)).toEqual([true, true])
    probe("context menu, redo")
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(deleted).toEqual([false, false, false, false])
    // Select all and Delete: everything drawn goes; the folded branch was never drawn.
    await page.keyboard.press("ControlOrMeta+a")
    await page.keyboard.press("Delete")
    await expect.poll(() => deleted().slice(0, 2)).toEqual([true, true])
    probe("select all + Delete")
    // Out of sight: Find, and a reload.
    await page.getByRole("toolbar", { name: "Board", exact: true }).getByRole("button", { name: "More", exact: true }).click()
    await page.getByRole("menuitem", { name: "Find and replace" }).click()
    await page.getByRole("textbox", { name: "Find on board" }).fill("Copy")
    await expect(page.getByText("Nothing on this board says that.")).toBeVisible()
    await page.reload()
    await expect(page.locator('[data-board-canvas][data-board-synced="true"]')).toBeAttached({ timeout: 30_000 })
    await page.waitForTimeout(1_000)
    expect(await drawnAnywhere(page, GREEN)).toBe(false)
    probe("after a reload")
    await context.close()
  })

  test("a node dragged, then its parent folded, stays alive through Undo and Redo of the fold (probe)", async ({ browser }) => {
    const on = mapBoard()
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const el = (id: string) => server(on)().find((e) => e.id === id)
    const alive = () => ["a1", "a1-label"].map((id) => el(id)?.isDeleted !== true)
    const folded = () => el("a")?.customData?.mindMap?.folded ?? false
    const probe = (step: string) => console.log(`PROBE-B ${step}: [a1, a1-label] alive ${JSON.stringify(alive())}, a1.x ${Math.round(el("a1")?.x ?? NaN)}, a folded ${folded()}`)
    const canvas = (await page.locator(".excalidraw canvas.interactive").boundingBox())!
    const x0 = el("a1")!.x
    await page.mouse.move(canvas.x + 440, canvas.y + 180)
    await page.mouse.down()
    await page.mouse.move(canvas.x + 480, canvas.y + 240, { steps: 8 })
    await page.mouse.up()
    await expect.poll(() => el("a1")!.x - x0).toBeGreaterThan(20)
    probe("dragged")
    await page.keyboard.press("Escape")
    await pressAt(page, "computer", 260, 180)
    await page.locator("[data-mind-map-bar]").getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(folded).toBe(true)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    probe("parent folded")
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(folded).toBe(false)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    probe("undo")
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect.poll(folded).toBe(true)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    // Once the drawing rests the filter has had its say; nothing else to wait on.
    await page.waitForTimeout(1_000)
    probe("redo")
    expect(alive()).toEqual([true, true])
    await context.close()
  })

  test("undoing an unfold or redoing a fold hides the branch, redoing the unfold draws it, and none deletes it", async ({ browser }) => {
    const on = mapBoard()
    const { context, page } = await openMember(browser, "computer", on)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    const bar = page.locator("[data-mind-map-bar]")
    const alive = () => server(on)().find((e) => e.id === "a1")?.isDeleted !== true
    const folded = () => server(on)().find((e) => e.id === "a")?.customData?.mindMap?.folded ?? false
    const unfold = async () => {
      await page.keyboard.press("Escape")
      await pressAt(page, "computer", 260, 180)
      await bar.getByRole("button", { name: "Unfold", exact: true }).click()
      await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
      expect(alive()).toBe(true)
    }
    await pressAt(page, "computer", 260, 180)
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await unfold()
    // Undo the unfold: folded again, its branch hidden and alive; unfolding draws it again.
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(folded).toBe(true)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await expect.poll(alive).toBe(true)
    // Redo the unfold: open again, its branch drawn and alive.
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect.poll(folded).toBe(false)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await expect.poll(alive).toBe(true)
    await page.keyboard.press("Escape")
    await pressAt(page, "computer", 260, 180)
    // Fold, undo it (the branch back), redo it: hidden again and alive.
    await bar.getByRole("button", { name: "Fold", exact: true }).click()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await page.keyboard.press("ControlOrMeta+z")
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(true)
    await page.keyboard.press("ControlOrMeta+Shift+z")
    await expect.poll(folded).toBe(true)
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await expect.poll(alive).toBe(true)
    await unfold()
    await context.close()
  })

  test("a phone's bar has Add child, Add sibling and Fold at 44 px, and adds a child laid out", async ({ browser }) => {
    const on = mapBoard()
    const { context, page } = await openMember(browser, "phone", on)
    await pressAt(page, "phone", 260, 180)
    const bar = page.locator("[data-mind-map-bar]")
    // The bar floats in (content.css's float-in): it is measured once its entrance has finished.
    await expect(bar.getByRole("button", { name: "Add child", exact: true })).toBeVisible()
    await bar.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)))
    for (const name of ["Add child", "Add sibling", "Fold"]) {
      const box = (await bar.getByRole("button", { name, exact: true }).boundingBox())!
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44)
    }
    await bar.getByRole("button", { name: "Add child", exact: true }).tap()
    await expect.poll(() => nodes(on).filter((e) => e.customData!.mindMap!.parent === "a").length).toBe(2)
    const kids = nodes(on).filter((e) => e.customData!.mindMap!.parent === "a")
    const a = nodes(on).find((e) => e.id === "a")!
    for (const k of kids) expect(k.x).toBeGreaterThan(a.x + a.width)
    await context.close()
  })

  test("a viewer and a share link's guest see the map folded, with no mind map actions", async ({ browser }) => {
    const on = mapBoard([...mind("root", 20, 200, "Launch", null), ...mind("a", 200, 120, "Site", "root"), ...mind("a1", 380, 120, "Copy", "a", "#0CA678")])
    const folded = on.collab.doc(NAME).getMap("elements")
    const a = folded.get("a") as Shared
    folded.set("a", { ...a, customData: { mindMap: { ...a.customData!.mindMap, folded: true } } })
    const { context, page } = await openMember(browser, "computer", on, USERS.ann)
    await expect(page.locator(".excalidraw canvas.static")).toBeAttached()
    await expect.poll(() => drawnAnywhere(page, GREEN)).toBe(false)
    await pressAt(page, "computer", 260, 180)
    await expect(page.locator("[data-mind-map-bar]")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Mind map", exact: true })).toHaveCount(0)
    await context.close()
    const guest = await browser.newContext(DEVICES.computer)
    const session = { collab_token: "guest", document_name: NAME, resource_type: "board", resource_id: BOARD, capability: "view", title: "Launch map", workspace_name: "Acme" }
    await fakeApp(guest, { app: String(test.info().project.use.baseURL), user: USERS.vic, docs: [], collab: on.collab, fixtures: [[new RegExp(`/guest/collab/${TOKEN}$`), { msg: "ok", data: session }]] })
    const gp = await guest.newPage()
    await gp.goto(`/guest/b/${TOKEN}`)
    await expect(gp.locator("[data-guest-board][data-board-elements]")).toBeAttached({ timeout: 30_000 })
    expect(await drawnAnywhere(gp, GREEN)).toBe(false)
    await guest.close()
  })
})
