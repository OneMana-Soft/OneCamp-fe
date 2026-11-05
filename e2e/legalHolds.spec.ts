import { expect, test, type Request } from "@playwright/test"

import { SAM, expectEveryCallAnswered, reviewShot, stubBackend, withHeaders, withStatus } from "./stubbedApp"
import { takesAFinger } from "./menuReach"
import { SCHEMES, SCREENS, press, screenUse } from "./screens"
import { expectNoToast } from "./toasts"

/**
 * Settings > Audit log > Calendar retention and legal holds (gcal-new-audit-retention H2): a workspace admin sets
 * how long calendar events are kept, seeing what the rule would remove before Save can be pressed; places a legal
 * hold on a member; searches what it keeps (deleted events marked) and saves an export named after the hold; and
 * releases it once confirmed. Each change is offered back in place, beside its tick, where a toast would lie over the
 * next step (main, 3 Nov 02:0x). On a computer and on a phone by touch, where every overlay is a sheet with its actions
 * pinned and every control takes a finger, light and dark.
 */
const ADMIN = { ...SAM, user_is_admin: true }
/** The audit tab's other cards, answered empty: no "Couldn't load" state of theirs, and no call left to the stub's toast (DB-108). */
const AUDIT_TAB_OTHERS = {
  "/admin/audit-log": { msg: "ok", data: { entries: [], categories: [], initiators: [] } },
  "/admin/audit-log/receipts": { msg: "ok", data: [] },
  "/admin/retention": { msg: "ok", data: { window_days: 0, keeps_everything: true, minimum_days_floor: 190 } },
  "/admin/seats": { msg: "ok", data: { used: 2, limit: 25, locked: [] } },
}
const RAVI = { user_uuid: "8c1f4b2e-0d3a-4f5e-9b6c-7a8d9e0f1a2b", user_name: "Ravi Iyer", user_email_id: "ravi@example.com" }
const RULE = { kind: "calendar", label: "calendar events", help: "Events that ended this many days ago are removed for good.", days: 0, min: 0, max: 3650 }
/** Boards, Retention's second kind (miro-44 R): a rule of their own, and a hold's search and export of its own. */
const BOARDS_RULE = { kind: "boards", label: "boards", help: "Boards in the trash this many days are removed for good.", days: 0, min: 0, max: 3650 }
const KINDS = [
  { name: "calendar", label: "calendar events", formats: ["ics", "json"] },
  { name: "boards", label: "boards", formats: ["json"] },
]
type Hold = { id: string; name: string; note: string; created_by: string; created_at: string; updated_at: string; released_at?: string; released_by?: string; people: string[] }
type Write = { method: string; path: string; body: unknown }

/** The server's words for anything asked of a released hold (409). */
const RELEASED = "That hold was released, so it can't change and its items aren't searched or exported."

/** One workspace's rules and holds as /admin/retention keeps them, starting with `seed`'s holds. */
function workspace(seed: Hold[] = []) {
  const rule = { ...RULE }
  const holds: Hold[] = seed.map((h) => ({ ...h, people: [...h.people] }))
  const writes: Write[] = []
  const asked: string[] = []
  // Which kind each search and export was for: "items calendar", "export boards".
  const kinds: string[] = []
  const at = "2026-11-02T10:00:00Z"
  // What a rule of `days` would remove now: keeping everything (0) removes nothing, as the server counts it. Events
  // can come due between the count and Save (moveCount), as in a live workspace.
  let due = 42
  const count = (days: number) => (days > 0 ? due : 0)
  const moveCount = () => {
    due += 1
  }
  const rules = (url: URL, request: Request) => {
    if (url.pathname.endsWith("/preview")) {
      const days = Number(url.searchParams.get("days"))
      return { data: { days, would_remove: count(days) } }
    }
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { days: number; shown: number }
      writes.push({ method: "PUT", path: url.pathname, body })
      // As business/Retention answers a count that moved since it was shown (CountMoved): 409, with the count now.
      if (body.shown !== count(body.days)) return withStatus(409, { msg: "The count changed since it was shown. Check the new count, then save again.", data: { would_remove: count(body.days) } })
      rule.days = body.days
      return { data: rule }
    }
    return { data: { rules: [rule, BOARDS_RULE], kinds: KINDS } }
  }
  const retention = (url: URL, request: Request) => {
    const path = url.pathname.slice(url.pathname.indexOf("/admin/retention/holds"))
    const [, , , , id, what, kind] = path.split("/")
    const method = request.method()
    if (method === "GET" && !id) return { data: [...holds].sort((a, b) => Number(!!a.released_at) - Number(!!b.released_at)) }
    const hold = holds.find((h) => h.id === id)
    if (method === "GET") {
      asked.push(`${what} ${url.search}`)
      if (kind) kinds.push(`${what} ${kind}`)
      if (!hold) return withStatus(404, { msg: "There's no such hold." })
      // A released hold's items are neither searched nor exported (the server's liveHold).
      if (hold.released_at) return withStatus(409, { msg: RELEASED })
      // A board has no date of its own: its item says who made it (business/Board heldSearch).
      if (what === "items" && kind === "boards") return { data: [{ id: "b1", title: "Launch plan", detail: "Made by Ravi Iyer", repeats: false }] }
      if (what === "items") return { data: [{ id: "e1", title: "Board review", start: "2026-10-02T09:00:00Z", repeats: false, deleted_at: "2026-10-05T09:00:00Z" }] }
      // A hold's boards within one part: the whole export, no part headers.
      if (kind === "boards") return { data: [{ id: "b1", title: "Launch plan" }] }
      // An export past the server's part size answers in parts (V-388): part 1 offers the next by its token.
      if (url.searchParams.get("part") === "2.cGFydDE") return withHeaders({ "x-exported-items": "3", "x-export-part": "2" }, { exported: 3 })
      return withHeaders({ "x-exported-items": "20000", "x-export-part": "1", "x-export-next": "2.cGFydDE" }, { exported: 20000 })
    }
    const body = method === "POST" && what === "release" ? null : request.postDataJSON()
    writes.push({ method, path, body })
    if (method === "POST" && !id) {
      const b = body as { name: string; note: string; add: string[] }
      // Placed only on someone, as the server places it.
      if (b.add.length === 0) return withStatus(400, { msg: "A hold names at least one person." })
      const placed = { id: `h${holds.length + 1}`, name: b.name, note: b.note, created_by: ADMIN.user_uuid, created_at: at, updated_at: at, people: b.add }
      holds.push(placed)
      return { data: placed }
    }
    if (!hold) return withStatus(404, { msg: "There's no such hold." })
    // A released hold neither changes nor is released again.
    if (hold.released_at) return withStatus(409, { msg: RELEASED })
    if (what === "release") Object.assign(hold, { released_at: at, released_by: ADMIN.user_uuid })
    if (method === "PATCH") {
      // A change as the server makes it: the name and note it's given, who joins (if not on it already) and who leaves.
      const b = body as { name: string; note: string; add: string[]; remove: string[] }
      Object.assign(hold, { name: b.name, note: b.note, people: [...hold.people.filter((p) => !b.remove.includes(p)), ...b.add.filter((p) => !hold.people.includes(p))] })
    }
    return { data: hold }
  }
  return { rules, retention, writes, asked, kinds, moveCount }
}

for (const scheme of SCHEMES) {
  for (const screen of SCREENS) {
    test.describe(`${screen.name}, ${scheme}`, () => {
      test.use(screenUse(screen, scheme))

      test("an admin sets a retention rule after seeing its count, places a hold, searches and exports it, and releases it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const phone = screen.hasTouch
        const ws = workspace()
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/user/allUsers": { msg: "ok", users: [ADMIN, RAVI] },
          "/admin/retention/rules": ws.rules,
          "/admin/retention/holds": ws.retention,
          ...AUDIT_TAB_OTHERS,
        })
        await page.goto("/app/admin?tab=audit", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const section = page.locator("#audit-holds")
        const days = section.getByRole("spinbutton", { name: "Remove calendar events after" })
        await expect(days).toBeVisible({ timeout: 60_000 })
        await days.scrollIntoViewIfNeeded()

        // The count comes before Save: Save waits for it, and sends it back.
        await days.fill("365")
        // The calendar rule's own Save: each kind's rule is a card of its own (boards are the second, miro-44 R).
        // (filter's `has` is asked inside each card, so it names the days box from there, not from the section.)
        const save = section
          .locator("[data-settings-card]")
          .filter({ has: page.getByRole("spinbutton", { name: "Remove calendar events after" }) })
          .getByRole("button", { name: "Save" })
        await expect(section.getByText("42 of the workspace's calendar events would be removed at the next sweep.")).toBeVisible()
        await expect(save).toBeEnabled()
        // A count that moved before Save is refused in the server's words, counted again, and saved on the count now.
        ws.moveCount()
        await press(screen, save)
        await expect.poll(() => ws.writes.find((w) => w.method === "PUT")).toEqual({ method: "PUT", path: "/admin/retention/rules/calendar", body: { days: 365, shown: 42 } })
        // Said on the row and again by its live region: the row's own line, word for word, is the one that shows.
        await expect(section.getByText("The count changed since it was shown. Check the new count, then save again.", { exact: true })).toBeVisible()
        // Said in place only: no toast says it again over what comes next (at 390 one lay over the new row's actions).
        // Counted once, past the shared toast's turn: a retrying toHaveCount(0) waited a toast out (V-410).
        await expectNoToast(page, "The count changed since it was shown.")
        await expect(section.getByText("43 of the workspace's calendar events would be removed at the next sweep.")).toBeVisible()
        await expect(save).toBeEnabled()
        await press(screen, save)
        await expect.poll(() => ws.writes.filter((w) => w.method === "PUT").at(-1)).toEqual({ method: "PUT", path: "/admin/retention/rules/calendar", body: { days: 365, shown: 43 } })

        // Offered back beside the row's tick, never on a toast over what comes next: back to keeping everything.
        const undoRule = section.getByRole("button", { name: "Undo: Calendar events removed after 365 days" })
        if (phone) expect(await takesAFinger(undoRule)).toBe(true)
        await press(screen, undoRule)
        await expect.poll(() => ws.writes.filter((w) => w.method === "PUT").at(-1)).toEqual({ method: "PUT", path: "/admin/retention/rules/calendar", body: { days: 0, shown: 0 } })
        await expect(days).toHaveValue("")

        // A hold on a member, from a sheet on the phone whose actions stay pinned in view.
        await expect(section.getByText("No holds")).toBeVisible()
        const place = section.getByRole("button", { name: "Place a hold" })
        // Two kinds' rules (calendar events, boards) put the holds below a phone's fold: scrolled to, as a finger would.
        await place.evaluate((el) => el.scrollIntoView({ block: "center" }))
        if (phone) expect(await takesAFinger(place)).toBe(true)
        await press(screen, place)
        const dialog = page.getByRole("dialog", { name: "Place a legal hold" })
        await expect(dialog).toBeVisible()
        if (phone) {
          await expect(dialog).toHaveAttribute("data-v3-sheet", "")
          await expect(dialog.getByRole("button", { name: "Place the hold" })).toBeInViewport()
        }
        await dialog.getByLabel("Name").fill("Acme v. Rivera")
        await dialog.getByLabel("Note").fill("Board minutes, Q3")
        await press(screen, dialog.getByRole("button", { name: "Add people" }))
        await page.getByPlaceholder("Find a member…").fill("Ravi")
        await press(screen, page.getByRole("option", { name: "Ravi Iyer" }))
        await page.keyboard.press("Escape")
        await expect(dialog.getByRole("button", { name: "Take Ravi Iyer off the hold" })).toBeVisible()
        // The chip's × takes a finger at 390, with "Add people" right under it (DB-99: it missed, both taps met the field).
        if (phone) expect(await takesAFinger(dialog.getByRole("button", { name: "Take Ravi Iyer off the hold" }))).toBe(true)
        await reviewShot(page, `legal-holds-place-${screen.name}`, scheme)
        await press(screen, dialog.getByRole("button", { name: "Place the hold" }))
        await expect(dialog).toBeHidden()
        expect(ws.writes.find((w) => w.method === "POST")).toEqual({ method: "POST", path: "/admin/retention/holds", body: { name: "Acme v. Rivera", note: "Board minutes, Q3", add: [RAVI.user_uuid] } })
        const row = section.getByRole("listitem", { name: "Acme v. Rivera" })
        await expect(row).toContainText("Ravi Iyer")
        if (phone) {
          for (const name of ["Search Acme v. Rivera", "Change Acme v. Rivera", "Release Acme v. Rivera"]) expect(await takesAFinger(row.getByRole("button", { name })), name).toBe(true)
        }

        // What the hold keeps, deleted events marked, and its export saved under the hold's name.
        await press(screen, row.getByRole("button", { name: "Search Acme v. Rivera" }))
        const search = page.getByRole("dialog", { name: "Search Acme v. Rivera" })
        await search.getByLabel("Words").fill("board")
        await press(screen, search.getByRole("button", { name: "Search", exact: true }))
        const item = search.getByRole("listitem", { name: "Board review" })
        await expect(item).toContainText("Deleted")
        expect(ws.asked).toContain("items ?q=board")
        await press(screen, search.getByRole("button", { name: "Export .ics" }))
        // Part 1 says it is not all of them, and offers the rest (V-388).
        await expect(search.getByText("Part 1: the first 20,000 calendar events that match, not all of them. Export part 2 for the rest.")).toBeVisible()
        const file = search.getByRole("link", { name: "Save Acme v. Rivera - calendar events - part 1.ics" })
        if (phone) await expect(file).toBeInViewport()
        expect(ws.asked).toContain("export ?format=ics&q=board")
        // Part 2 asked for before part 1 is saved keeps part 1 to save (V-431): a legal export never loses a part.
        await press(screen, search.getByRole("button", { name: "Export part 2" }))
        await expect(search.getByText("Part 2, the last: 3 more calendar events. Parts 1 to 2 hold all that match.")).toBeVisible()
        const last = search.getByRole("link", { name: "Save Acme v. Rivera - calendar events - part 2.ics" })
        if (phone) await expect(last).toBeInViewport()
        await expect(search.getByRole("button", { name: /^Export part/ })).toHaveCount(0)
        expect(ws.asked).toContain("export ?format=ics&part=2.cGFydDE&q=board")
        const saved = page.waitForEvent("download")
        await press(screen, file)
        expect((await saved).suggestedFilename()).toBe("Acme v. Rivera - calendar events - part 1.ics")
        // Any part made again starts where the part before it ends.
        await press(screen, search.getByRole("button", { name: "Export again: part 2" }))
        await expect.poll(() => ws.asked.filter((a) => a === "export ?format=ics&part=2.cGFydDE&q=board").length).toBe(2)
        await expect(last).toBeVisible()
        // Each part's label keeps its line (DB-108 F1): on a phone it takes the row, its actions under it at the right;
        // on a computer they share the line.
        for (const n of [1, 2]) {
          const part = search.getByRole("listitem", { name: `Part ${n}` })
          const [row, label, save] = await Promise.all([part.boundingBox(), part.locator("p").first().boundingBox(), part.getByRole("link", { name: /^Save / }).boundingBox()])
          if (!row || !label || !save) throw new Error(`part ${n} isn't drawn`)
          expect(label.height, `part ${n}'s label is one line`).toBeLessThan(30)
          if (phone) {
            expect(label.width, `part ${n}'s label takes the row`).toBeGreaterThan(row.width - 2 * 12 - 2)
            expect(save.y, `part ${n}'s Save is under its label`).toBeGreaterThanOrEqual(label.y + label.height - 1)
            expect(Math.abs(save.x + save.width - (row.x + row.width - 12)), `part ${n}'s Save is at the row's right`).toBeLessThanOrEqual(2)
          } else {
            expect(save.y, `part ${n}'s Save shares its label's line`).toBeLessThan(label.y + label.height)
          }
        }
        await reviewShot(page, `legal-holds-search-${screen.name}`, scheme)

        // Boards are a second kind (miro-44 R): the search asks which, and each kind searches and exports its own.
        const kinds = search.getByRole("radiogroup", { name: "Items" })
        await expect(kinds.getByRole("radio", { name: "Calendar events" })).toBeChecked()
        const boards = kinds.getByRole("radio", { name: "Boards" })
        if (phone) expect(await takesAFinger(boards)).toBe(true)
        await press(screen, boards)
        await expect(boards).toBeChecked()
        // What the calendar search found, and its parts, go with the pick; the words stay.
        await expect(item).toHaveCount(0)
        await expect(search.getByRole("link", { name: /^Save / })).toHaveCount(0)
        await expect(search.getByRole("button", { name: "Export .ics" })).toHaveCount(0)
        await expect(search.getByLabel("Words")).toHaveValue("board")
        await press(screen, search.getByRole("button", { name: "Search", exact: true }))
        const board = search.getByRole("listitem", { name: "Launch plan" })
        await expect(board).toContainText("Made by Ravi Iyer")
        await expect(board).not.toContainText("No date")
        await press(screen, search.getByRole("button", { name: "Export .json" }))
        const boardsFile = search.getByRole("link", { name: "Save Acme v. Rivera - boards.json" })
        // The file is offered only once the export has answered, on both widths: asked before it, the check ran ahead of the
        // export's call at 1280 under load (gate-f1's red run, computer dark).
        await expect(boardsFile).toBeVisible()
        if (phone) await expect(boardsFile).toBeInViewport()
        expect(ws.asked).toContain("export ?format=json&q=board")
        expect(ws.kinds.filter((k) => k.endsWith(" boards"))).toEqual(["items boards", "export boards"])
        await reviewShot(page, `legal-holds-search-boards-${screen.name}`, scheme)
        await page.keyboard.press("Escape")
        await expect(search).toBeHidden()

        // Released only once confirmed; it stays listed, and is neither changed nor searched any more.
        await press(screen, row.getByRole("button", { name: "Release Acme v. Rivera" }))
        const confirm = page.getByRole("dialog", { name: "Release Acme v. Rivera?" })
        expect(ws.writes.some((w) => w.path.endsWith("/release"))).toBe(false)
        await press(screen, confirm.getByRole("button", { name: "Release the hold" }))
        await expect(confirm).toBeHidden()
        expect(ws.writes.at(-1)).toEqual({ method: "POST", path: "/admin/retention/holds/h1/release", body: null })
        await expect(row).toContainText("Released")

        // The release offered back beside the list's heading: Undo places the hold again, with its name, note and people.
        const undoRelease = section.getByRole("button", { name: "Undo: Released Acme v. Rivera" })
        if (phone) expect(await takesAFinger(undoRelease)).toBe(true)
        await press(screen, undoRelease)
        await expect.poll(() => ws.writes.at(-1)).toEqual({ method: "POST", path: "/admin/retention/holds", body: { name: "Acme v. Rivera", note: "Board minutes, Q3", add: [RAVI.user_uuid] } })
        await expect(section.getByRole("button", { name: "Release Acme v. Rivera" })).toHaveCount(1)
        const released = section.getByRole("listitem", { name: "Acme v. Rivera" }).filter({ hasText: "Released" })
        await expect(released.getByRole("button", { name: "Change Acme v. Rivera" })).toHaveCount(0)
        await expect(released.getByRole("button", { name: "Search Acme v. Rivera" })).toHaveCount(0)

        // A change that changes nothing is sent nowhere, and offered back nowhere.
        const live = section.getByRole("listitem", { name: "Acme v. Rivera" }).filter({ hasNotText: "Released" })
        await press(screen, live.getByRole("button", { name: "Change Acme v. Rivera" }))
        const same = page.getByRole("dialog", { name: "Change the hold" })
        const sent = ws.writes.length
        await press(screen, same.getByRole("button", { name: "Save the hold" }))
        await expect(same).toBeHidden()
        expect(ws.writes.length).toBe(sent)
        await expect(section.getByRole("button", { name: "Undo: Changed Acme v. Rivera" })).toHaveCount(0)

        // A change offered back beside the heading: Undo puts back the note it had.
        await press(screen, live.getByRole("button", { name: "Change Acme v. Rivera" }))
        const change = page.getByRole("dialog", { name: "Change the hold" })
        await change.getByLabel("Note").fill("Board minutes, Q4")
        await press(screen, change.getByRole("button", { name: "Save the hold" }))
        await expect(change).toBeHidden()
        expect(ws.writes.at(-1)).toEqual({ method: "PATCH", path: "/admin/retention/holds/h2", body: { name: "Acme v. Rivera", note: "Board minutes, Q4", add: [], remove: [] } })
        await expect(live).toContainText("Board minutes, Q4")
        const undoChange = section.getByRole("button", { name: "Undo: Changed Acme v. Rivera" })
        if (phone) expect(await takesAFinger(undoChange)).toBe(true)
        await press(screen, undoChange)
        await expect.poll(() => ws.writes.at(-1)).toEqual({ method: "PATCH", path: "/admin/retention/holds/h2", body: { name: "Acme v. Rivera", note: "Board minutes, Q3", add: [], remove: [] } })
        await expect(live).toContainText("Board minutes, Q3")
        await expect(undoChange).toHaveCount(0)

        // A hold placed by mistake, offered back beside the heading: Undo releases it.
        await press(screen, section.getByRole("button", { name: "Place a hold" }))
        const another = page.getByRole("dialog", { name: "Place a legal hold" })
        await another.getByLabel("Name").fill("Beta matter")
        // A hold names at least one person, as the server places it.
        await press(screen, another.getByRole("button", { name: "Add people" }))
        await page.getByPlaceholder("Find a member…").fill("Ravi")
        await press(screen, page.getByRole("option", { name: "Ravi Iyer" }))
        await page.keyboard.press("Escape")
        await expect(another.getByRole("button", { name: "Take Ravi Iyer off the hold" })).toBeVisible()
        await press(screen, another.getByRole("button", { name: "Place the hold" }))
        await expect.poll(() => ws.writes.at(-1)).toEqual({ method: "POST", path: "/admin/retention/holds", body: { name: "Beta matter", note: "", add: [RAVI.user_uuid] } })
        await expect(another).toBeHidden()
        const undoPlace = section.getByRole("button", { name: "Undo: Placed Beta matter" })
        if (phone) expect(await takesAFinger(undoPlace)).toBe(true)
        await press(screen, undoPlace)
        await expect.poll(() => ws.writes.at(-1)).toEqual({ method: "POST", path: "/admin/retention/holds/h3/release", body: null })
        await expect(section.getByRole("listitem", { name: "Beta matter" })).toContainText("Released")
        await expect(undoPlace).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })

      test("a hold whose names can't be read says how many, and reads them again on a tap that never meets its actions", async ({ page }, testInfo) => {
        const phone = screen.hasTouch
        const at = "2026-11-02T10:00:00Z"
        const ws = workspace([{ id: "h1", name: "Acme v. Rivera", note: "", created_by: ADMIN.user_uuid, created_at: at, updated_at: at, people: [RAVI.user_uuid] }])
        // The members' read fails until the admin asks again.
        let down = true
        let read = 0
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: ADMIN },
          "/user/allUsers": () => {
            read += 1
            return down ? withStatus(503, { msg: "The server is busy." }) : { msg: "ok", users: [ADMIN, RAVI] }
          },
          "/admin/retention/rules": ws.rules,
          "/admin/retention/holds": ws.retention,
          ...AUDIT_TAB_OTHERS,
        })
        await page.goto("/app/admin?tab=audit", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = page.locator("#audit-holds").getByRole("listitem", { name: "Acme v. Rivera" })
        const again = row.getByRole("button", { name: "Show their names" })
        await expect(again).toBeVisible({ timeout: 60_000 })
        await expect.poll(() => read).toBeGreaterThan(0)
        await expect(row).toContainText("1 person.")
        await again.evaluate((el) => el.scrollIntoView({ block: "center" }))
        // The way back to the names takes a finger at 390, and so does every action under it (DB-99: a low tap opened Change).
        if (phone) {
          expect(await takesAFinger(again)).toBe(true)
          for (const name of ["Search Acme v. Rivera", "Change Acme v. Rivera", "Release Acme v. Rivera"]) expect(await takesAFinger(row.getByRole("button", { name })), name).toBe(true)
        }
        down = false
        await press(screen, again)
        await expect(row).toContainText("Ravi Iyer")
        await expect(again).toHaveCount(0)
        await expect(page.getByRole("dialog")).toHaveCount(0)
        await expectEveryCallAnswered(page)
      })
    })
  }
}
