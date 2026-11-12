// Work's surfaces on the 2,000-task project (workspace.mjs): the project's
// page (fluid-19), its list read to the end and worked from the keyboard
// (fluid-17), a task's panel (fluid-18), the board scrolled and a card dragged
// (fluid-08), the timeline (fluid-09), and a task made and changed from the
// keyboard, Linear's row (fluid-23: linearRow below). Budgets: work-budgets.json.
import { BIG_PROJECT, chatFixtures, workFixtures, workSidebar } from "../workspace.mjs"

// The selectors the projects programme's harness found (perf-harness/measure.mjs, 14 Oct).
const ROW = "[data-grouped-list] [data-task-id], [data-phone-task-row]"
const CARD = "[data-board] [data-column] [data-task-id]"
const BAR = "[data-timeline] [data-bar]"
const MAIN = "[data-split-view='-1'], [data-app-scroller]"

// The rows a list shows, and those it knows of (shown, plus what each "Show
// N more" holds back), in the page. A windowed list draws only the rows near
// the screen, so a group whose rows carry aria-setsize (the rows it shows,
// drawn or not) counts that, and otherwise its drawn rows: the same numbers
// on a list that draws every row (FLUIDITY-LEAD-4, 21 Oct 2026, ahead of the
// windowing package; release-1010/design/fluidity/WINDOWING-SCOPE-2026-10-21.md).
function listCounts() {
  window.__fluShownRows = () => {
    // A windowed list may say how many rows it shows, drawn or not
    // (data-rows on its role=list): a group scrolled wholly out of view draws
    // none, and is counted by what it says (W2-WINDOW, 22 Oct 2026). A build
    // without it keeps its numbers.
    let n = 0
    for (const l of document.querySelectorAll("[data-grouped-list] [role='list'][data-rows]")) n += Number(l.getAttribute("data-rows")) || 0
    const sets = new Map()
    for (const r of document.querySelectorAll("[data-grouped-list] [data-task-id], [data-phone-task-row]")) {
      if (r.closest("[role='list'][data-rows]")) continue
      const set = r.closest("[data-group]") || document
      const s = sets.get(set) || { drawn: 0, size: 0 }
      s.drawn++
      s.size = Math.max(s.size, Number(r.getAttribute("aria-setsize")) || 0)
      sets.set(set, s)
    }
    for (const s of sets.values()) n += s.size || s.drawn
    return n
  }
  window.__fluKnownRows = () => {
    let n = window.__fluShownRows()
    for (const b of document.querySelectorAll("button")) {
      const m = /^Show (\d+) more$/.exec((b.textContent || "").trim())
      if (m) n += Number(m[1])
    }
    return n
  }
}

// ---- fluid-23: a task made and changed from the keyboard (Linear's row) ----
// The app's own keys (lib/listKeys, WorkToolbar): C opens the composer; S, P
// and A open the status, priority and assignee pickers for what is selected
// (the highlighted row when nothing is); X selects and Shift J extends a run.
// Every write goes through the app's own write path (the composer's
// createTask, the pickers' POST /task/bulk and updateTaskAssignee), answered
// by workspace.mjs, which keeps it for the reads after it.
const TITLE = "input#task_name"
const PICKER = "[cmdk-input]"
const LIST_ROW = "[data-grouped-list] [data-task-id]"
const PRIORITY_LEVEL = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 }

// In the page: when a row or card with this title first shows (sel), whether
// it was the app's own copy then (its id temp-), and when it carries the
// server's id: "before the server answers", and "settled with the server".
function watchMade({ sel, title }) {
  const w = (window.__fluMade = { shownAt: null, temp: null, settledAt: null })
  const look = () => {
    for (const r of document.querySelectorAll(sel)) {
      if (!(r.textContent || "").includes(title)) continue
      const id = r.getAttribute("data-task-id") || ""
      if (w.shownAt == null) {
        w.shownAt = performance.now()
        w.temp = id.startsWith("temp-")
      }
      if (id && !id.startsWith("temp-") && w.settledAt == null) w.settledAt = performance.now()
    }
    if (w.settledAt == null) requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}
const focusedOn = (sel) => {
  const el = document.activeElement
  return !!el && el.matches(sel) && el.getBoundingClientRect().height > 0
}
// A picker is open and ready: its input has focus and its choices are drawn.
const pickerReady = (sel) => !!document.activeElement?.matches(sel) && document.querySelectorAll("[cmdk-item]").length > 0

/**
 * The composer opened (C on a computer; on a phone the create button tapped:
 * its list has none, so the board's, the project's one on a phone), a title
 * typed, and Enter (a phone taps Create task): until the new row (card) shows,
 * and until it carries the server's id. `inList` is where the new one shows.
 */
async function makeTask(h, M, { inList }) {
  const { page } = h
  if (!h.wants("taskCompose") && !h.wants("taskCreate")) return
  const create = page.getByRole("button", { name: "New task", exact: true }).first()
  const compose = await h.step("taskCompose", {
    act: () => (h.phone ? h.press(create) : page.keyboard.press("c")),
    ready: () => h.until(focusedOn, TITLE, { timeout: 10000 }),
    settle: 500,
  })
  M.taskComposeMs = compose?.ready
  M.taskComposeRenders = compose?.renders
  // Ready to type means it stays so once the composer has settled.
  if (!(await page.evaluate(focusedOn, TITLE).catch(() => false))) {
    console.log("  taskCompose: the title lost focus once the composer settled")
    await page.locator(TITLE).focus().catch(() => {})
  }
  const title = `Fluid new task ${String(Date.now()).slice(-6)}`
  // Into the title that has focus, as one input (a locator's fill waits on checks an open dialog never passes).
  await page.keyboard.insertText(title)
  await page.waitForTimeout(300)
  await page.evaluate(watchMade, { sel: inList, title })
  const submit = page.getByRole("button", { name: /^Create task/ }).first()
  const made = await h.step("taskCreate", {
    act: async () => {
      if ((await page.evaluate(() => document.activeElement?.value ?? "").catch(() => "")) !== title) throw new Error("the title didn't take the text")
      if (h.phone) await h.press(submit)
      else await page.keyboard.press("Enter")
    },
    ready: () => h.until(() => window.__fluMade?.shownAt != null, null, { timeout: 10000 }),
    settle: 300,
  })
  await page.waitForFunction(() => window.__fluMade?.settledAt != null, null, { timeout: 10000 }).catch(() => {})
  const w = await page.evaluate(() => ({ ...window.__fluMade, input: window.__fluInputAt }))
  M.taskCreateMs = made?.ready
  M.taskCreateRenders = made?.renders
  // 1 when the row first showed as the app's own copy, before the server's answer.
  M.taskCreateOptimistic = w.temp == null ? null : w.temp ? 1 : 0
  M.taskCreateSettledMs = made?.ok && w.settledAt != null && w.input != null ? Math.round(w.settledAt - w.input) : null
  // The composer closes once the server has the task; one still open is closed.
  await page.locator(TITLE).waitFor({ state: "detached", timeout: 5000 }).catch(() => page.keyboard.press("Escape").catch(() => {}))
  await page.waitForTimeout(600)
}

/** A key's picker opened on the row the keys are on, then a choice typed and Enter, until the row draws it. */
async function pickOnRow(h, M, { key, row, word, painted, name }) {
  const { page } = h
  const open = await h.step(`task${name}Picker`, {
    act: () => page.keyboard.press(key),
    ready: () => h.until(pickerReady, PICKER, { timeout: 10000 }),
    settle: 400,
  })
  M[`task${name}PickerMs`] = open?.ready
  M[`task${name}PickerRenders`] = open?.renders
  if (!open?.ok) {
    await page.keyboard.press("Escape").catch(() => {})
    return
  }
  await page.keyboard.type(word, { delay: 30 })
  await page.waitForTimeout(300)
  const chose = await h.step(`task${name}Choose`, {
    act: () => page.keyboard.press("Enter"),
    ready: () => h.until(painted, row, { timeout: 10000 }),
    settle: 800,
  })
  M[`task${name}ChooseMs`] = chose?.ready
  M[`task${name}ChooseRenders`] = chose?.renders
  if (chose && !chose.ok) {
    // What the row draws instead: its faces' names, its priority and its group.
    const drawn = await page.evaluate((id) => {
      const r = document.querySelector(`[data-grouped-list] [data-task-id="${id}"]`)
      if (!r) return "the row is not in the list"
      const tips = [...r.querySelectorAll("[data-assignee]")].map((a) => `${a.getAttribute("data-assignee")}:${a.getAttribute("data-tip") ?? ""}`)
      return `faces [${tips.join(", ")}], priority ${r.querySelector("[data-priority-level]")?.getAttribute("data-priority-level") ?? "-"}, group ${r.closest("[data-group]")?.getAttribute("data-group") ?? "-"}`
    }, row[0]).catch((e) => `unread: ${String(e.message).split("\n")[0]}`)
    console.log(`  task${name}Choose: wanted ${JSON.stringify(row[1])}; the row draws ${drawn}`)
  }
}

/**
 * fluid-23 on a computer, by its keys, on a fresh page of the project (the
 * steps before it read the whole list and opened its other tabs): C, then
 * Enter; P, A and S on one row; X on 50 rows (X, then Shift J 49 times), then
 * S. ⌘K, the row's fifth target, is fluid-13's palette (the shell group).
 */
async function keyboardRow(h, M, project) {
  const { page } = h
  const steps = ["taskCompose", "taskCreate", "taskPriorityPicker", "taskPriorityChoose", "taskAssigneePicker", "taskAssigneeChoose", "taskStatusPicker", "taskStatusChoose", "taskSelectRun", "taskBulkPicker", "taskBulkChoose"]
  if (!steps.some((s) => h.wants(s))) return
  await h.goto(project)
  await h.ready({ sel: LIST_ROW, path: "/app/project/" }, { fromNav: true, timeout: 60000 })
  await page.waitForTimeout(1500)
  // The pointer off the list: a row it rests on is the row the keys act on.
  await page.mouse.move(5, 300)

  await makeTask(h, M, { inList: LIST_ROW })

  // ---- P, A and S on one row: the fourth of the list, the keys on it ----
  await page.mouse.move(5, 300)
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("j")
    await page.waitForTimeout(80)
  }
  await page.waitForTimeout(300)
  const at = await page.evaluate((sel) => {
    const r = document.querySelector(`${sel}[data-highlighted]`)
    if (!r) return null
    return {
      id: r.getAttribute("data-task-id"),
      level: Number(r.querySelector("[data-priority-level]")?.getAttribute("data-priority-level") ?? -1),
      who: r.querySelector("[data-assignee] [aria-label], [data-assignee][data-tip]")?.getAttribute("aria-label") || r.querySelector("[data-assignee]")?.getAttribute("data-tip") || "",
      group: r.closest("[data-group]")?.getAttribute("data-group") ?? "",
    }
  }, LIST_ROW)
  if (!at) console.log("  fluid-23: no row has the keys after J: the row's pickers are skipped")
  else {
    const priority = at.level === PRIORITY_LEVEL.high ? "low" : "high"
    await pickOnRow(h, M, {
      key: "p",
      name: "Priority",
      word: priority,
      row: [at.id, PRIORITY_LEVEL[priority]],
      painted: ([id, lv]) => !!document.querySelector(`[data-grouped-list] [data-task-id="${id}"] [data-priority-level="${lv}"]`),
    })
    const person = /maya/i.test(at.who) ? "Jonas Weber" : "Maya Chen"
    await pickOnRow(h, M, {
      key: "a",
      name: "Assignee",
      word: person.split(" ")[0],
      row: [at.id, person],
      // The face's name is the app's (displayNameOf: a full name or a handle),
      // so the person is known by their first name, in any case.
      painted: ([id, who]) => {
        const r = document.querySelector(`[data-grouped-list] [data-task-id="${id}"]`)
        const first = who.split(" ")[0].toLowerCase()
        return !!r && [...r.querySelectorAll("[data-assignee]")].some((a) => (a.getAttribute("data-tip") || a.querySelector("[aria-label]")?.getAttribute("aria-label") || "").toLowerCase().includes(first))
      },
    })
    // A new status moves the row to that status's group: painted once it has
    // left its old group (and, where the new group draws it, sits there).
    const status = at.group === "inReview" ? "progress" : "review"
    await pickOnRow(h, M, {
      key: "s",
      name: "Status",
      word: status,
      row: [at.id, at.group],
      painted: ([id, was]) => {
        const r = document.querySelector(`[data-grouped-list] [data-task-id="${id}"]`)
        return !r || (r.closest("[data-group]")?.getAttribute("data-group") ?? "") !== was
      },
    })
    M.taskStatusChooseDrawn = (await page.locator(`${LIST_ROW}[data-task-id="${at.id}"]`).count()) > 0 ? 1 : 0
  }

  // ---- a run of 50 (X, then Shift J 49 times), then S: every row repainted ----
  // Esc twice: the selection cleared, then the keys let go of their row; J takes the list's first.
  await page.keyboard.press("Escape")
  await page.waitForTimeout(200)
  await page.keyboard.press("Escape")
  await page.waitForTimeout(300)
  await page.mouse.move(5, 300)
  await page.keyboard.press("j")
  await page.waitForTimeout(300)
  const run = await h.step("taskSelectRun", {
    act: async () => {
      await page.keyboard.press("x")
      for (let i = 0; i < 49; i++) {
        await page.waitForTimeout(40)
        await page.keyboard.press("Shift+J")
      }
    },
    typed: 50,
    settle: 500,
  })
  M.taskSelectKeyP95Ms = run?.keyP95
  M.rendersPerSelectKey = run?.rendersPerKey
  const picked = await page.evaluate((sel) => [...document.querySelectorAll(`${sel}[data-state="selected"]`)].map((r) => [r.getAttribute("data-task-id"), r.closest("[data-group]")?.getAttribute("data-group") ?? ""]), LIST_ROW)
  M.taskSelectedCount = picked.length
  if (picked.length > 0) {
    const bulk = await h.step("taskBulkPicker", {
      act: () => page.keyboard.press("s"),
      ready: () => h.until(pickerReady, PICKER, { timeout: 10000 }),
      settle: 400,
    })
    M.taskBulkPickerMs = bulk?.ready
    M.taskBulkPickerRenders = bulk?.renders
    if (bulk?.ok) {
      await page.keyboard.type("progress", { delay: 30 })
      await page.waitForTimeout(300)
      // Painted when no selected row still stands in its old group: each has
      // moved to In progress's group, drawn there where the group draws it.
      const choose = await h.step("taskBulkChoose", {
        act: () => page.keyboard.press("Enter"),
        ready: () =>
          h.until(
            (rows) =>
              rows.every(([id, was]) => {
                const r = document.querySelector(`[data-grouped-list] [data-task-id="${id}"]`)
                return !r || (r.closest("[data-group]")?.getAttribute("data-group") ?? "") !== was
              }),
            picked,
            { timeout: 10000 },
          ),
        settle: 1500,
      })
      M.taskBulkChooseMs = choose?.ready
      M.taskBulkChooseRenders = choose?.renders
      M.taskBulkRowsDrawn = await page.evaluate((ids) => ids.filter(([id]) => document.querySelector(`[data-grouped-list] [data-task-id="${id}"]`)).length, picked)
    }
  }
  await page.keyboard.press("Escape").catch(() => {})
}

const group = {
  name: "work",
  fixtures: () => [...workFixtures(), ...chatFixtures({ sidebar: workSidebar() })],
  // The demo's corner card opens after a first "win" (the card drag's move)
  // and sat over the board's last column through the column drag: seeded as
  // already turned down (components/banner/DemoLeadPrompt).
  storage: { "onecamp:demo-lead-dismissed": "1" },
  initScripts: [{ fn: listCounts }],
  async run(h) {
    const { page } = h
    const M = {}
    const project = `/app/project/${BIG_PROJECT.id}`

    // ---- the project's page, cold: a fresh tab straight to it ----
    const cold = await h.step("projectCold", {
      act: () => h.goto(project),
      ready: () => h.ready({ sel: ROW, path: "/app/project/" }, { fromNav: true, timeout: 60000 }),
      nav: true,
      settle: 1500,
    })
    M.projectColdMs = cold?.ready
    M.projectColdLongMs = cold?.longMs
    M.projectColdKB = cold?.net?.scriptKB
    M.projectColdCls = cold?.cls

    // ---- in the app: Home, then the project from the sidebar (a phone's
    // Projects tab), then Home and the project again (its data cached) ----
    const projectLink = page.locator(`a[href="${project}"]`).first()
    for (const kind of ["projectOpen", "projectAgain"]) {
      // A step left out (--steps) leaves the page where it is: no trip to Home.
      if (!h.wants(kind)) continue
      await h.push("/app/home")
      await page.waitForTimeout(1500)
      const r = await h.step(kind, {
        act: () => h.visit(projectLink, project),
        ready: () => h.ready({ sel: ROW, path: "/app/project/" }),
        blank: MAIN,
        settle: 1200,
      })
      M[`${kind}Ms`] = r?.ready
      M[`${kind}Renders`] = r?.renders
      M[`${kind}BlankFrames`] = r?.blankFrames
    }

    // ---- the list read to its end: every page ("Show more tasks"), then
    // every group opened ("Show N more"), until all 2,000 rows are drawn ----
    // What the list knows of: the rows it shows and the rows its groups hold back (listCounts).
    const known = () => page.evaluate(() => window.__fluKnownRows())
    const pageMore = []
    for (let i = 0; i < 6; i++) {
      const button = page.getByRole("button", { name: /^Show more tasks$/ }).first()
      if (!(await button.count())) break
      await button.scrollIntoViewIfNeeded().catch(() => {})
      const before = await known()
      const r = await h.step(`listPage${i + 1}`, {
        act: () => h.press(button),
        ready: () => h.until((was) => window.__fluKnownRows() > was, before),
        settle: 800,
      })
      pageMore.push(r)
    }
    // A step left out (--steps) leaves its metric unset: no budget row, rather than a miss.
    const worst = (rows, pick) => (rows.some(Boolean) ? Math.max(0, ...rows.map((r) => pick(r) ?? 0)) || null : undefined)
    M.listPageMoreP95Ms = worst(pageMore, (r) => r?.ready)
    M.listPageMoreRenders = worst(pageMore, (r) => r?.renders)
    const groupMore = []
    for (let i = 0; i < 8; i++) {
      const button = page.getByRole("button", { name: /^Show \d+ more$/ }).first()
      if (!(await button.count())) break
      await button.scrollIntoViewIfNeeded().catch(() => {})
      const rows = await page.evaluate(() => window.__fluShownRows())
      const r = await h.step(`listGroup${i + 1}`, {
        act: () => h.press(button),
        ready: () => h.until((was) => window.__fluShownRows() > was, rows, { timeout: 30000 }),
        settle: 800,
      })
      groupMore.push(r)
    }
    M.listGroupOpenP95Ms = worst(groupMore, (r) => r?.ready)
    M.listGroupOpenRenders = worst(groupMore, (r) => r?.renders)
    // The rows the list shows (drawn or, windowed, said by aria-setsize), and the page's elements.
    M.listRows = await page.evaluate(() => window.__fluShownRows())
    M.listDomNodes = await page.evaluate(() => document.querySelectorAll("*").length)

    // ---- scrolling the long list, from its top ----
    await page.locator(ROW).first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(500)
    const scroller = h.wants("listScroll") ? await h.scrollerOf(page.locator(ROW)) : page.locator("[data-flu-scroller]")
    const scroll = await h.step("listScroll", {
      // Down in three wheels of up to 5,000 px, none past the list's end, then back up 8,000 or to its top. A list
      // shorter than 15,000 px left the third wheel nothing to move, and the step failed on every build (10 Nov).
      act: async () => {
        const left = () => scroller.evaluate((el) => Math.floor(el.scrollHeight - el.clientHeight - el.scrollTop))
        for (let i = 0; i < 3; i++) {
          const dy = Math.min(5000, await left())
          if (dy < 4) break
          await h.scroll(scroller, { dy })
        }
        const top = await scroller.evaluate((el) => Math.floor(el.scrollTop))
        await h.scroll(scroller, { dy: -Math.min(8000, top) })
      },
      frames: true,
      settle: 600,
    })
    M.listScrollFrameP95Ms = scroll?.frames?.p95
    M.listScrollDroppedPct = scroll?.frames?.droppedPct
    M.listScrollLongMs = scroll?.longMs
    M.listScrollRenders = scroll?.renders
    if (h.wants("listScroll")) await scroller.evaluate((el) => (el.scrollTop = 0)).catch(() => {})
    await page.waitForTimeout(400)

    // ---- the keyboard: J twenty times down the list (a computer's) ----
    if (!h.phone) {
      await page.locator(ROW).first().hover().catch(() => {})
      await page.mouse.move(5, 300)
      const keys = await h.step("listKeys", {
        act: async () => {
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press("j")
            await page.waitForTimeout(80)
          }
        },
        typed: 20,
        settle: 500,
      })
      M.listKeyP95Ms = keys?.keyP95
      M.rendersPerListKey = keys?.rendersPerKey
    }

    // ---- a row dragged eight rows down (L-1's manual order; skipped on a
    // build without its grips). Lifted by a 12 px move, carried in 30 steps,
    // timed from the release until the row sits at its new place ----
    const grip = page.locator("[data-grouped-list] [data-task-id]").nth(3).locator("[data-reorder-grip]")
    if (!h.phone && h.wants("listDrag") && (await grip.count())) {
      const rowsBefore = await page.locator("[data-grouped-list] [data-task-id]").evaluateAll((els) => els.map((e) => e.getAttribute("data-task-id")))
      const moved = rowsBefore[3]
      await page.locator("[data-grouped-list] [data-task-id]").nth(3).hover()
      const g = await grip.boundingBox()
      const drag = await h.step("listDrag", {
        act: async () => {
          if (!g) throw new Error("no grip")
          const x0 = g.x + g.width / 2
          const y0 = g.y + g.height / 2
          await page.mouse.move(x0, y0)
          await page.mouse.down()
          await page.mouse.move(x0, y0 + 12, { steps: 2 })
          for (let i = 1; i <= 30; i++) {
            await page.mouse.move(x0, y0 + 12 + (8 * 40 * i) / 30)
            await page.waitForTimeout(16)
          }
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.mouse.up()
        },
        ready: () =>
          h.until((id) => {
            const ids = [...document.querySelectorAll("[data-grouped-list] [data-task-id]")].map((e) => e.getAttribute("data-task-id"))
            return ids.indexOf(id) >= 8
          }, moved, { timeout: 10000 }),
        frames: true,
        settle: 1200,
      })
      M.listDragFrameP95Ms = drag?.frames?.p95
      M.listDragDroppedPct = drag?.frames?.droppedPct
      M.listDropMs = drag?.ready
      M.listDragRenders = drag?.renders
    }

    // ---- a task's panel ----
    const row = page.locator(ROW).nth(3)
    const rowName = !h.wants("taskPanel") ? "" : ((await row.locator("[data-task-check]").first().getAttribute("aria-label", { timeout: 5000 }).catch(() => "")) || (await row.innerText().catch(() => "")))
      .replace(/^Mark (.*) (complete|as not done)$/, "$1")
      .split("\n")[0]
    // A computer opens it in the right panel; a phone opens the task's page.
    const panel = await h.step("taskPanel", {
      act: () => h.press(row),
      ready: () => h.ready(h.phone ? { sel: "h1, h2, [data-task-panel]", text: rowName.slice(0, 20), path: "/app/task/" } : { sel: "[data-task-panel]", text: rowName.slice(0, 24) }, { timeout: 20000 }),
      settle: 1200,
    })
    M.taskPanelMs = panel?.ready
    M.taskPanelInpMs = panel?.inp
    M.taskPanelRenders = panel?.renders
    await page.keyboard.press("Escape")
    await page.waitForTimeout(600)
    // Back on the project's page, whatever the panel step left.
    if (h.phone || !page.url().includes(project)) {
      await h.push(project)
      await h.ready({ sel: ROW, path: "/app/project/" }, { timeout: 30000 }).catch(() => {})
      await page.waitForTimeout(1200)
    }

    // ---- the board: its tab, a column scrolled, a card dragged to the next column ----
    const toBoard = h.phone ? () => h.press(page.getByRole("tab", { name: /^Board$/ }).first()) : () => page.keyboard.press("2")
    const board = await h.step("boardOpen", {
      act: toBoard,
      ready: () => h.ready({ sel: CARD }, { timeout: 30000 }),
      settle: 1200,
    })
    M.boardOpenMs = board?.ready
    M.boardOpenRenders = board?.renders
    M.boardOpenLongMs = board?.longMs
    // A column scrolled a long way down and back (its own scroller).
    const column = page.locator("[data-board] [data-column] [data-board-scroll]").first()
    // (each board step below runs only when asked for, so a left-out step costs no wait)
    const colScroll = await h.step("boardScroll", {
      act: async () => {
        await h.scroll(column, { dy: 6000 })
        await h.scroll(column, { dy: -6000 })
      },
      frames: true,
      settle: 600,
    })
    M.boardScrollFrameP95Ms = colScroll?.frames?.p95
    M.boardScrollDroppedPct = colScroll?.frames?.droppedPct
    M.boardScrollRenders = colScroll?.renders
    if (h.wants("boardScroll")) M.boardDomNodes = await page.evaluate(() => document.querySelectorAll("*").length)
    // A card dragged to the next column (as the projects harness drags one):
    // a press, a 12 px move lifts it, then thirty steps across; timed from
    // the release until the card is in its new column.
    if (!h.phone && h.wants("boardDrag")) {
      const card = page.locator(CARD).nth(3)
      const cardId = await card.getAttribute("data-task-id")
      const b = await card.boundingBox()
      const to = await page.locator("[data-board] [data-column]").nth(1).boundingBox()
      let dropSettled = null
      const drag = await h.step("boardDrag", {
        act: async () => {
          if (!b || !to) throw new Error("no card or column")
          const x0 = b.x + b.width / 2
          const y0 = b.y + b.height / 2
          await page.mouse.move(x0, y0)
          await page.mouse.down()
          await page.mouse.move(x0 + 3, y0)
          await page.mouse.move(x0 + 12, y0)
          await page.waitForSelector(".work-drag-overlay", { timeout: 5000 })
          const dx = to.x + to.width / 2 - (x0 + 12)
          for (let i = 1; i <= 30; i++) {
            await page.mouse.move(x0 + 12 + (dx * i) / 30, y0 + i * 4)
            await page.waitForTimeout(16)
          }
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.mouse.up()
        },
        // Timed to the card's arrival in its new column, the commit the
        // person sees at once. The overlay's glide into the slot (the board's
        // 220 ms drop animation) is motion, not work: boardDropSettledMs.
        ready: async () => {
          const placed = await h.ready({ sel: `[data-board] [data-column]:nth-of-type(2) [data-task-id="${cardId}"]` }, { timeout: 10000 }).catch(() => null)
          dropSettled = await h.ready({ gone: ".work-drag-overlay" }, { timeout: 5000 }).catch(() => null)
          return placed ?? dropSettled
        },
        frames: true,
        settle: 1200,
      })
      M.boardDragFrameP95Ms = drag?.frames?.p95
      M.boardDragDroppedPct = drag?.frames?.droppedPct
      M.boardDropMs = drag?.ready
      M.boardDropSettledMs = dropSettled
      M.boardDropInpMs = drag?.inp
      M.boardDragRenders = drag?.renders
    }

    // ---- To do carried one place right by its grip, past the middle of the
    // open column after it (column drag; skipped on a build without it):
    // timed from the release until the board shows the new order. Done and
    // Cancelled stay after the open columns (lib/board/columnOrder), so a
    // place among them is refused and nothing would move: the third slot is
    // Done on this board (PROJ-LEAD-3, 21 Oct) ----
    const head = page.locator('[data-board] [data-column="todo"] [data-column-head]').first()
    const colGrip = page.getByRole("button", { name: /^Move the To do column$/ }).first()
    if (!h.phone && h.wants("columnDrag") && (await head.count())) {
      await head.hover().catch(() => {})
      const order = () => page.locator("[data-board] [data-column-slot]").evaluateAll((els) => els.map((e) => e.getAttribute("data-column-slot") || e.textContent?.slice(0, 20)))
      const before = await order()
      const g = await colGrip.boundingBox().catch(() => null)
      const after = before[before.indexOf("todo") + 1]
      const next = after && !/^(done|canceled)$/.test(after) ? await page.locator(`[data-board] [data-column-slot="${after}"]`).first().boundingBox() : null
      const col = await h.step("columnDrag", {
        act: async () => {
          if (!g) throw new Error("no column grip")
          if (!next) throw new Error(`no open column after To do (${before.join(", ")})`)
          const x0 = g.x + g.width / 2
          const y0 = g.y + g.height / 2
          await page.mouse.move(x0, y0)
          await page.mouse.down()
          await page.mouse.move(x0 + 12, y0, { steps: 2 })
          // Three quarters across it: past its middle, so the gap is after it.
          const dx = next.x + next.width * 0.75 - x0
          for (let i = 1; i <= 30; i++) {
            await page.mouse.move(x0 + 12 + (dx * i) / 30, y0)
            await page.waitForTimeout(16)
          }
          await page.evaluate(() => (window.__fluInputAt = performance.now()))
          await page.mouse.up()
        },
        ready: () =>
          h.until((was) => {
            const now = [...document.querySelectorAll("[data-board] [data-column-slot]")].map((e) => e.getAttribute("data-column-slot") || e.textContent?.slice(0, 20))
            return now.join("|") !== was.join("|")
          }, before, { timeout: 10000 }),
        frames: true,
        settle: 1200,
      })
      M.columnDragFrameP95Ms = col?.frames?.p95
      M.columnDragDroppedPct = col?.frames?.droppedPct
      M.columnDropMs = col?.ready
      M.columnDragRenders = col?.renders
    }

    // ---- the timeline: opened by its number key, its place among the
    // project's tabs. Backlog came before it on 18 Oct (B3), so the "3" this
    // step pressed opened Backlog and the step timed out on every build ----
    if (!h.phone) {
      const key = await page
        .getByRole("tab", { name: /^Timeline$/ })
        .first()
        .evaluate((t) => String([...(t.closest("[role=tablist]")?.querySelectorAll("[role=tab]") ?? [])].indexOf(t) + 1), undefined, { timeout: 5000 })
        .catch(() => "0")
      const tl = await h.step("timelineOpen", {
        act: async () => {
          if (key === "0") throw new Error("no Timeline tab among the project's tabs")
          await page.keyboard.press(key)
        },
        ready: () => h.ready({ sel: BAR }, { timeout: 30000 }),
        settle: 1200,
      })
      M.timelineOpenMs = tl?.ready
      M.timelineOpenRenders = tl?.renders
      const area = page.locator("[data-timeline] [role=region]").first()
      const pan = await h.step("timelineScroll", {
        act: async () => {
          await h.scroll(area, { dx: 2500 })
          await h.scroll(area, { dx: -2500 })
          await h.scroll(area, { dy: 2000 })
        },
        frames: true,
        settle: 600,
      })
      M.timelineScrollFrameP95Ms = pan?.frames?.p95
      M.timelineScrollDroppedPct = pan?.frames?.droppedPct
      M.timelineScrollRenders = pan?.renders
    }

    // ---- fluid-23: a task made and changed from the keyboard (Linear's row).
    // A phone's, by touch, where it has the controls: its list has no create
    // button, so the board's (the page is on the Board tab here); its rows have
    // no pickers (a swipe's Due and More open the task's page) and its
    // selection no status, so a phone makes the task and no more ----
    if (h.phone) await makeTask(h, M, { inList: CARD })
    else await keyboardRow(h, M, project)
    return M
  },
}

export default group
