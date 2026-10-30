import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"
import ts from "typescript"
import { lineProblem, sourceMeasure } from "../scripts/fluidity/routes.mjs"

import { chainOf, firstScreen, firstScreenEntries, sourceOf, walk } from "../scripts/fluidity/reach.mjs"

// What a visitor's first screen downloads. A new visitor waited 8 to 9
// seconds for Home, a good part of it on code Home never runs: the editor
// (ProseMirror, Yjs, code highlighting) came in through the thread panel in
// the app's layout, and the MQTT client through the realtime provider. They
// load when they're needed now. This walks the static imports from the
// layouts and Home (a dynamic import() starts a chunk of its own, so it isn't
// followed) and fails, naming the chain, if one of them is reached again.

// Firebase (17 Oct 2026): web push's SDK came with every signed-in first
// screen through components/fcm/FCMHandler; it is fetched once the page is idle.
// Zod (21 Oct 2026, fluid-15): 18 KB on the wire of every first screen, for an
// environment check and the self profile's shape; forms that validate bring it.
// i18next (21 Oct 2026, fluid-15): 20 KB, set up by the signed-in layout for
// the task views and the profile card, which bring it now (lib/utils/i18n).
const HEAVY = ["@tiptap/", "prosemirror-", "yjs", "y-prosemirror", "lowlight", "highlight.js", "mqtt", "framer-motion", "livekit-client", "@livekit/", "firebase/", "@dnd-kit/", "zod", "i18next", "react-i18next"]
const ENTRIES = ["app/layout.tsx", "app/app/layout.tsx", "app/app/home/page.tsx"]

// One walker for every first-load guard (scripts/fluidity/reach.mjs), and one
// table of route ceilings (scripts/fluidity/route-ceilings.json): the source
// ceilings here, and the gzip ceilings routes.mjs holds after a build.
const CEILINGS = JSON.parse(readFileSync("scripts/fluidity/route-ceilings.json", "utf8")) as {
  routes: Record<string, { source?: number; gzipKB?: number; edition?: "ai" }>
  beyondHome: Record<string, { source: number }>
}

/** The AI edition; the edition without AI has no AI pages or query plans. */
const AI_EDITION = existsSync("components/ai/MarkdownMessage.tsx")

/** A route's source ceiling from the one table. */
function sourceCeiling(file: string): number {
  const c = CEILINGS.routes[file]?.source
  if (typeof c !== "number") throw new Error(`${file} has no source ceiling in scripts/fluidity/route-ceilings.json`)
  return c
}

function heavyReach(entries: string[]): string[] {
  const { files, packages } = walk(firstScreenEntries(entries)) as { files: Map<string, string | null>; packages: Array<[string, string]> }
  const found: string[] = []
  for (const [spec, file] of packages) {
    if (HEAVY.some((h) => spec === h.replace(/\/$/, "") || spec.startsWith(h))) found.push(`${spec}: ${chainOf(files, file)}`)
  }
  return found
}

describe("a visitor's first screen", () => {
  it("doesn't download the editor, the realtime client or an animation library", () => {
    expect(heavyReach(ENTRIES)).toEqual([])
  })

  // The invite form rides in the shell (the command host's Invite people), and
  // read its seat words from the people settings, which brought those settings
  // and their search field to every first screen (SHADCN-AUDIT SA-2).
  it("leaves the people settings out of the shell", () => {
    const shell = new Set(ENTRIES.flatMap((e) => [...reach(e).keys()]))
    expect(shell.has("components/admin/PeopleFrame.tsx")).toBe(false)
  })

  it("would see one: the composer, walked from, brings the editor", () => {
    expect(heavyReach(["components/textInput/textInput.tsx"]).some((r) => r.startsWith("@tiptap/"))).toBe(true)
  })

  it("would see one: a task row's parts, walked from, bring i18next", () => {
    expect(heavyReach(["components/task/taskRowParts.tsx"]).some((r) => r.startsWith("i18next"))).toBe(true)
  })

  it("would see one: the new task form, walked from, brings Zod", () => {
    expect(heavyReach(["components/task/taskCreateForm.tsx"]).some((r) => r.startsWith("zod"))).toBe(true)
  })

  it("would see one: web push's module, walked from, brings Firebase", () => {
    expect(heavyReach(["lib/firebase.ts"]).some((r) => r.startsWith("firebase/"))).toBe(true)
  })
})

// A project's first screen (design v3 work wave, 11 Oct): its route's script
// grew from 299 to 380 KB when the board, timeline, updates, files, the
// phone's page and the project's dialogs all rode in with the list. Each is
// a chunk of its own now, loaded when its tab or dialog opens. This walks
// the route's static imports and fails if one of them is reached again, and
// holds the source the route pulls in under a ceiling that may only go down.
const PROJECT_ROUTE = "app/app/project/[project-id]/page.tsx"
const PROJECT_LAZY = [
  "components/project/projectTaskKanban.tsx",
  "components/kanbanComponents/TaskBoard.tsx",
  "components/project/timeline/ProjectTimeline.tsx",
  "components/projectUpdates/ProjectUpdates.tsx",
  "components/project/ProjectAttachments.tsx",
  "components/project/projectListTabs.tsx",
  "components/project/ProjectStatusesDialog.tsx",
  "components/project/ProjectFieldsDialog.tsx",
  "components/project/ProjectFormsDialog.tsx",
  "components/project/ProjectShareDialog.tsx",
  "components/project/ProjectTimeDialog.tsx",
  "components/project/ProjectRatesDialog.tsx",
  "components/project/ProjectKeyTypesDialog.tsx",
  // Few tasks have a type, so their glyphs load when one first shows (A8K).
  "components/task/TaskTypeGlyph.tsx",
  "components/projectTemplates/SaveAsTemplateDialog.tsx",
  "components/task/cycleBurndownDialog.tsx",
  "components/charts/SvgChart.tsx",
  "components/task/taskCreateForm.tsx",
  // The forecast's chip and its card are chunks of their own (linear-20, V-49): the route holds LazyForecastChip.
  // The card's frame, which the chip's slot draws too, comes with the chip.
  "components/project/ForecastChip.tsx",
  "components/project/ForecastCardFrame.tsx",
  "components/project/ForecastCard.tsx",
  "lib/work/forecast.ts",
  // The timeline's layout and the workload's sums: a list's writes need only
  // a date reader and the workload's address (lib/tasks/taskDate,
  // lib/workloadKey), and the two came in whole, 37 KB, through useTaskUpdate.
  "lib/timeline.ts",
  "lib/workload.ts",
  // The toolbar's menus (15 Oct 2026): the first screen draws the Cycles and
  // Fields chips and the Display button, and each one's body is a chunk that
  // loads as the pointer or the focus reaches it, with the app's select and
  // cmdk in them. The goal chip reads its percentage from lib/goalPercent,
  // not all of lib/goals.
  "components/task/cyclesSwitcher.tsx",
  "components/task/displayMenu.tsx",
  "components/task/fieldFilterMenu.tsx",
  "components/ui/select.tsx",
  "components/ui/command.tsx",
  // The combobox brings cmdk too (SA-3): the toolbar's chips open it as a chunk.
  "components/ui/combobox.tsx",
  "lib/goals.ts",
  // The number reader: a field's value is read where it is typed, in the task
  // panel (lib/tasks/fieldInput), never where a list shows it (17d, 16 Oct:
  // through lib/tasks/fields it took the route 1,160 B over its ceiling).
  "lib/format/number.ts",
  // The bursts (17 Oct 2026): a finish is noted at once (lib/celebrateSoon),
  // and its sparks come from lib/celebrate, fetched when the page is idle.
  "lib/celebrate.ts",
  // The task types' form schema and zod: only the new task form reads it as
  // a value; everything else names a task's type with `import type` (20 Oct).
  "types/task.ts",
  // A refused download's words are read where a download fails (V-97): in the
  // time report's dialog and the task list's export, each a chunk of its own.
  "lib/utils/downloadRefusal.ts",
]
/**
 * Bytes of source the project route reaches by static import: 1.61 MB before
 * the split, 0.95 MB after, 0.93 MB once the toolbar's menus were chunks. The
 * ceiling lives in the one table (scripts/fluidity/route-ceilings.json).
 */
const PROJECT_ROUTE_SOURCE_CEILING = sourceCeiling(PROJECT_ROUTE)

/**
 * The files a first screen reaches by static import, each with the file that
 * brought it (reach.mjs firstScreen): a page with the layouts and boundaries of
 * its own folders beyond the shared shell, any other file alone (V-49).
 */
const reach = (entry: string): Map<string, string | null> => firstScreen(entry) as Map<string, string | null>

/**
 * A page's source line: what its route reaches, the page with every layout and
 * boundary above it, once each (V-49). Moving an import into a layout doesn't
 * lower it: every visit still loads the layout.
 */
const routeSource = (page: string): number => sourceMeasure(page) as number

describe("a project's first screen", () => {
  const reached = reach(PROJECT_ROUTE)
  it("loads the list only: other tabs, the phone's page and the dialogs are chunks of their own", () => {
    expect(PROJECT_LAZY.filter((f) => reached.has(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    const bytes = routeSource(PROJECT_ROUTE)
    expect(bytes, `the project route reaches ${bytes} bytes of source (ceiling ${PROJECT_ROUTE_SOURCE_CEILING})`).toBeLessThanOrEqual(PROJECT_ROUTE_SOURCE_CEILING)
  })
})

// The calendar's first screen (calendar programme A0; PM-3, CAL13): the grid
// comes first. Quick create, the full dialog, the event panel, Go to with
// the parser, the Calendars popover, an event's pop card and menu, the month
// view, Duplicate's copy of an event, a repeating event's scope question and
// changes (with the calendar's own API) and booking settings load on first
// use, fetched ahead when the page is idle (calendarApp.tsx); the phone's day
// strip draws its days without the date picker's library and its select
// (components/ui/dayCell.tsx). Its ceiling, set at its first measurement,
// only goes down; so do the public booking pages', which every outsider
// opens (CAL9).
const CALENDAR_ROUTE = "app/app/calendar/page.tsx"
const CALENDAR_LAZY = [
  "components/calendar/quickCreateCard.tsx",
  "components/calendar/createCalendarEventDialog.tsx",
  "components/rightPanel/eventInfoPanel.tsx",
  "components/calendar/goToDate.tsx",
  "lib/calendar/parseEventText.ts",
  "components/calendar/calendarsPopover.tsx",
  "components/calendar/eventMenu.tsx",
  "components/calendar/eventPopover.tsx",
  "components/ui/dropdown-menu.tsx",
  "components/calendar/monthView.tsx",
  "components/calendar/dayOverflowPopover.tsx",
  // The all-day rail's "+N" list (step 3), made a chunk on 17 Oct to give the
  // route back the bytes Join's one call-link test cost it.
  "components/calendar/railMore.tsx",
  // The year (B1): twelve months of days, drawn when Y or its segment shows it.
  "components/calendar/yearView.tsx",
  // Duplicate's copier (lib/calendar/duplicate.ts), fetched ahead with the
  // dialog it fills; a chunk since 17 Oct, for the room chat, projects and
  // the calendar's next work need under the ceiling.
  "lib/calendar/duplicate.ts",
  // A booked meeting's question before a move, and Delete's question and
  // request: an action asks them, fetched when the page is idle.
  "lib/calendar/bookedMeeting.ts",
  "lib/calendar/confirmDelete.ts",
  "components/calendar/bookingSettings.tsx",
  "components/calendar/scopePromptDialog.tsx",
  "components/calendar/seriesChanges.ts",
  "lib/calendar/eventsApi.ts",
  "components/ui/calendar.tsx",
  "components/ui/select.tsx",
  // The agenda (23 Oct): a phone's first view, asked for while the events
  // load, and a computer's when idle or pointed at; room for F2's row and
  // C9's broken-sync mark.
  "components/calendar/calendarAgenda.tsx",
]
/**
 * 816,537 bytes when every surface came with the grid; 760,717 after (14 Oct
 * 2026); 752,243 once the day strip stopped bringing the date picker (15 Oct);
 * 768,587 with beta's shell on 16 Oct, and 743,642 once the month view became
 * a chunk of its own. 753,143 with step 3's event card on 17 Oct; 745,569 once
 * the rail's list and duplicate's copier (with the name helper only it
 * brought) became chunks, room for the work queued behind it; repeating
 * events (A7) then keep a repeating event's changes, its scope question and
 * the calendar's own API in chunks too, and a 503's toast title no longer
 * names the calendar. 721,199 on beta aa0b3c34c (23 Oct); 711,381 once the
 * agenda became a chunk, and the line came down by the room rule.
 */
const CALENDAR_ROUTE_SOURCE_CEILING = sourceCeiling(CALENDAR_ROUTE)
/**
 * The public booking pages: 219,767 and 227,303 bytes (14 Oct 2026); 241,094
 * and 248,607 with beta's load-failure states on 16 Oct; 164,761 and 172,296
 * once the gone page and the booked burst came only when wanted. The page a
 * guest invited by email answers on (calendar A2): 117,632 at its first
 * measurement, 17 Oct.
 */
const BOOKING_ROUTE_SOURCE_CEILINGS: Record<string, number> = Object.fromEntries(
  ["app/book/[slug]/page.tsx", "app/booking/[token]/page.tsx", "app/rsvp/[token]/page.tsx"].map((route) => [route, sourceCeiling(route)]),
)
/** What an outsider's booking page brings only when it is wanted: the gone or failed page, and the booked burst. */
const BOOKING_LAZY = ["components/guest/publicStates.tsx", "components/ui/load-failure-state.tsx", "lib/celebrate.ts"]

describe("the calendar's first screen", () => {
  const reached = reach(CALENDAR_ROUTE)
  it("loads the grid only: its surfaces are chunks of their own, loaded on first use", () => {
    expect(CALENDAR_LAZY.filter((f) => reached.has(f))).toEqual([])
    // Each is a file that exists: a list naming files that went away would pass for nothing.
    expect(CALENDAR_LAZY.filter((f) => !existsSync(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    const bytes = routeSource(CALENDAR_ROUTE)
    expect(bytes, `the calendar route reaches ${bytes} bytes of source (ceiling ${CALENDAR_ROUTE_SOURCE_CEILING})`).toBeLessThanOrEqual(CALENDAR_ROUTE_SOURCE_CEILING)
  })

  it("leaves a booking page's rare ends, the gone page and the burst, to chunks of their own", () => {
    for (const route of Object.keys(BOOKING_ROUTE_SOURCE_CEILINGS)) {
      const reached = reach(route)
      expect(BOOKING_LAZY.filter((f) => reached.has(f)), route).toEqual([])
    }
  })

  it("keeps each public booking page under its own ceiling", () => {
    for (const [route, ceiling] of Object.entries(BOOKING_ROUTE_SOURCE_CEILINGS)) {
      const bytes = routeSource(route)
      expect(bytes, `${route} reaches ${bytes} bytes of source (ceiling ${ceiling})`).toBeLessThanOrEqual(ceiling)
    }
  })
})

// A table's first screen (tables programme A1/A2, T1 and T2, landed together
// on 18 Oct 2026, then T3's trim): the grid comes first. The chain took the
// route from 1.55 MB of source to 1.63 MB: the record's comments and page, the
// column menu's settings, the formula editor and link settings, and every view
// and dialog rode with the grid. The other views, the record, the trash, the
// share and publish dialogs, the column menus' pages and the cells' pickers
// are chunks of their own (components/table/lazyParts, ColumnMenu,
// cellPickerPart), loaded when one opens and warmed on intent or when idle; a
// row opened as a page brings its page, and the page's editor only for a row
// that has a page. This walks the route's static imports and fails if one of
// them is reached again, and holds the source the route pulls in under a line
// that is the measure with no margin and only goes down.
const TABLE_ROUTE = "app/app/tables/[table-id]/page.tsx"
const TABLE_LAZY = [
  "lib/tables/applyRules.ts",
  "components/table/DataTableBoard.tsx",
  "components/table/DataTableCalendar.tsx",
  "components/table/DataTableChart.tsx",
  "components/charts/SvgChart.tsx",
  "components/table/RecordPanel.tsx",
  "components/table/comments/RowComments.tsx",
  "components/table/rowPage/RowPage.tsx",
  "components/table/rowPage/RowPageEditor.tsx",
  "components/table/trash/TableTrash.tsx",
  "components/marketplace/PublishTemplateDialog.tsx",
  "components/guest/GuestLinkSection.tsx",
  "components/table/columnMenu/ColumnMenuBody.tsx",
  "components/table/columnMenu/AddColumnBody.tsx",
  "components/table/FormulaEditor.tsx",
  "components/table/fields/FieldSettings.tsx",
  "components/table/LinkSettings.tsx",
  "components/fields/OptionsEditor.tsx",
  "components/table/cellPickers.tsx",
  "components/ui/CommandList.tsx",
  "components/ui/calendar.tsx",
  "services/searchService.ts",
  // Tables B1 (T3): the new kinds' cells that draw more than text, their
  // settings, the status's and people's combobox; and what made room for them,
  // the sort and filter menus' insides, the share dialog, the CSV writer and
  // the formula editor's catalogue.
  "components/table/kindCells.tsx",
  "components/table/fields/KindSettings.tsx",
  "components/ui/combobox.tsx",
  "components/combobox/userComboboxItem.tsx",
  "components/table/rules/RuleMenus.tsx",
  "components/table/ShareTableDialog.tsx",
  "components/ui/dialog.tsx",
  "lib/tables/csv.ts",
  "lib/tables/formulaCatalogue.ts",
  // Saved views (migration 512) made room by the export, read on use.
  "lib/tables/exportRows.ts",
  // A spreadsheet's rows into the table (tables S1 step 7): the More menu reads it on use.
  "components/table/import/ImportSheetDialog.tsx",
  "lib/tables/sheetImport.ts",
  // Tables T5c paid for the windows (the server's meaning, the window hook,
  // the placeholders) by these: the phone's list, the page's two dropdown
  // menus with the dropdown they're drawn in, and the save dot by the name.
  "components/table/TableRowList.tsx",
  "components/table/TableMenus.tsx",
  "components/ui/dropdown-menu.tsx",
  "components/docEditor/SaveDot.tsx",
  // B4: the gallery, and the timeline with the Gantt, are chunks of their own (the
  // projects' timeline maths with them); the list layout is the phone's list.
  "components/table/layouts/TableGallery.tsx",
  "components/table/layouts/TableTimeline.tsx",
  "lib/timeline.ts",
  // A link cell's face at rest, asked for by a table with link fields alone:
  // it made room for the bar's sums left out and asked again (V-48).
  "components/table/relationFace.tsx",
]
/**
 * 1,547,717 bytes before the chain (b18j, 18 Oct 2026); 1,634,372 when it landed;
 * 1,635,087 once P-SPEED's MQTT context split met it (a recorded one-off);
 * 1,194,825 after T3's trim; 1,193,961 with T3's new kinds. 825,000 once a
 * view's rules applied in the browser became a chunk of their own (814,720,
 * 26 Oct), with room kept for nested filter groups (V4). The line lives in
 * the one table, scripts/fluidity/route-ceilings.json.
 */
const TABLE_ROUTE_SOURCE_CEILING = sourceCeiling(TABLE_ROUTE)

describe("a table's first screen", () => {
  const reached = reach(TABLE_ROUTE)
  it("loads the grid only: the other views, the record, the dialogs, the column menus and the cells' pickers are chunks of their own", () => {
    expect(TABLE_LAZY.filter((f) => reached.has(f))).toEqual([])
    // Each is a file that exists: a list naming files that went away would pass for nothing.
    expect(TABLE_LAZY.filter((f) => !existsSync(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    const bytes = routeSource(TABLE_ROUTE)
    expect(bytes, `the table route reaches ${bytes} bytes of source (ceiling ${TABLE_ROUTE_SOURCE_CEILING})`).toBeLessThanOrEqual(TABLE_ROUTE_SOURCE_CEILING)
  })
})

/**
 * The Inbox (chat P2's Threads tab, 19 Oct 2026): its first screen is the feed.
 * The Threads tab's list and the AI tab's record of what agents did (with its
 * governance drill and its rows) are chunks of their own, fetched when their
 * tab first opens: 930,716 bytes of source with the AI tab drawn in, 794,862
 * without it.
 */
const INBOX_ROUTE = "app/app/inbox/page.tsx"
const INBOX_LAZY = [
  "components/activity/threadsList.tsx",
  ...(AI_EDITION ? ["components/ai/MyAIActivityCard.tsx", "components/admin/GovernanceDrillCard.tsx"] : []),
]

describe("the Inbox's first screen", () => {
  it("draws the feed: the Threads and AI tabs are chunks of their own", () => {
    const reached = reach(INBOX_ROUTE)
    expect(INBOX_LAZY.filter((f) => reached.has(f))).toEqual([])
    expect(INBOX_LAZY.filter((f) => !existsSync(f))).toEqual([])
  })
})

// The tables list and a guest's shared table (T3, 18 Oct 2026): the list's
// trash (its dialog and a phone's drawer) is a chunk loaded when it opens, and
// a guest's read-only table draws its cells itself, never bringing the members'
// grid (it once did, for a day's helper) with its pickers and settings.
describe("the tables list and a guest's table", () => {
  it("leave what they don't draw at first to chunks of their own", () => {
    expect(reach("app/app/tables/page.tsx").has("components/table/trash/TablesTrash.tsx")).toBe(false)
    expect(reach("app/app/tables/page.tsx").has("components/table/import/ImportSheetDialog.tsx")).toBe(false)
    const guest = reach("app/guest/t/[token]/page.tsx")
    expect(["components/table/gridCells.tsx", "components/table/cellPickers.tsx", "components/table/kindCells.tsx"].filter((f) => guest.has(f))).toEqual([])
  })
})

// The celebrations' bursts (17 Oct 2026): every screen calls them through
// lib/celebrateSoon, which notes a finish at once and fetches lib/celebrate
// (the sparks and rings, 10 KB) when the page is idle. No page or layout
// brings it with its first screen; My Tasks' board and phone row included.
/** Every page and layout under `dir` (or each file `names` matches), as repository paths. */
const pagesAndLayouts = (dir: string, names = /^(page|layout)\.tsx$/): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pagesAndLayouts(path.join(dir, e.name), names) : names.test(e.name) ? [path.join(dir, e.name)] : [],
  )

/**
 * A phone's page for one event (app/app/calendar/event/[eventId]): the panel
 * reads the event, and what only an edit, a question or a menu's item needs
 * is a chunk of its own, fetched when the page is idle (eventInfoPanel.tsx):
 * the repeat editor with its rule sheet and the rules' words, the scope
 * question, "Tell guests?", and the assistant's Find a better time and Prep
 * brief. 944,456 bytes of source with repeating events (A7) and guests'
 * answers (A2) on 18 Oct; 808,300 once they were chunks. Its line, 811,000,
 * is the measure with calendar A5's reminders behind the same boundary; the
 * one Event Form (calendar FORM) took the panel's inline edit off it (747,262),
 * and its edit kit, values, notes and save, followed: 726,013 (line 729,000,
 * the measure plus 2 KB, rounded up).
 */
const EVENT_ROUTE = "app/app/calendar/event/[eventId]/page.tsx"
const EVENT_LAZY = [
  "components/calendar/repeat/repeatControl.tsx",
  "components/calendar/repeat/customRepeatSheet.tsx",
  "lib/calendar/repeat.ts",
  "components/calendar/scopePromptDialog.tsx",
  "components/calendar/tellGuestsDialog.tsx",
  ...(AI_EDITION ? ["components/ai/RescheduleDialog.tsx", "components/ai/MeetingPrepDialog.tsx"] : []),
  // The reader's reminders (calendar A5): the panel's row and its menu's words.
  "components/calendar/rsvp/reminderRow.tsx",
  "lib/calendar/reminders.ts",
  // The one Event Form (calendar FORM), drawn when Edit is pressed, with all
  // it brings: the date and time pickers, the zones, the people picker; and
  // the rest of the edit kit, its values, the notes' conversions and the save.
  "components/calendar/form/panelEdit.ts",
  "components/calendar/form/eventForm.tsx",
  "components/ui/date-time-picker.tsx",
  "components/ui/zonePicker.tsx",
  "components/common/peoplePicker.tsx",
  "lib/calendar/eventForm.ts",
  "lib/calendar/notes.ts",
  "components/calendar/form/saveEvent.ts",
]

describe("the calendar event page's first screen", () => {
  const reached = reach(EVENT_ROUTE)
  it("reads the event: its repeat editor, its questions and the assistant's dialogs are chunks of their own", () => {
    expect(EVENT_LAZY.filter((f) => reached.has(f)).map((f) => chainOf(reached, f))).toEqual([])
    // Each is a file that exists: a list naming files that went away would pass for nothing.
    expect(EVENT_LAZY.filter((f) => !existsSync(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    const bytes = routeSource(EVENT_ROUTE)
    expect(bytes, `the event page reaches ${bytes} bytes of source (ceiling ${sourceCeiling(EVENT_ROUTE)})`).toBeLessThanOrEqual(sourceCeiling(EVENT_ROUTE))
  })
})

describe("the celebrations' bursts", () => {
  it("are on no first screen: every page and layout leaves lib/celebrate to its own chunk", () => {
    const routes = pagesAndLayouts("app")
    expect(routes).toContain("app/app/myTask/page.tsx")
    expect(routes.filter((r) => reach(r).has("lib/celebrate.ts"))).toEqual([])
  })
})

// The realtime provider (19 Oct 2026). The signed-in layout mounts it once; a
// page that reads the connection (a table's live rows, an import's progress)
// reads it through components/mqtt/mqttContext. Until then useMqttTopic and
// eight cards imported useMqtt through the provider, and every page using them
// carried the provider's handlers: chat's mentions, posts and drafts on a table.
describe("the realtime provider", () => {
  it("is the signed-in layout's: no page brings it or its handlers", () => {
    const pages = pagesAndLayouts("app").filter((r) => r.endsWith("page.tsx"))
    expect(pages).toContain(TABLE_ROUTE)
    // The light provider, and the engine it starts with the handlers (fluid-15).
    const theirs = ["components/mqtt/mqttProvider.tsx", "components/mqtt/RealtimeEngine.tsx", "hooks/useMqttMessageHandler.ts"]
    expect(pages.flatMap((r) => {
      const reached = reach(r)
      return theirs.filter((f) => reached.has(f)).map((f) => `${r}: ${chainOf(reached, f)}`)
    })).toEqual([])
  })
})

// The shell's rare pieces (17 Oct 2026, the shell diet). Every signed-in first
// screen carried them, though each is wanted only now and then; each is a
// chunk of its own now. SHELL_LAZY is held from the layouts and Home. ROOT_LAZY
// is held from the root layout alone, which every page loads, signed in or
// not: sign-in, guest, booking and invoice pages.
const SHELL_LAZY = [
  // The profile menu's body: drawn from its first open, fetched when its
  // trigger is pointed at or focused (components/navigationBar/desktop/SidebarFoot).
  "components/navigationBar/desktop/ProfileMenuBody.tsx",
  // An AI answer's charts and query plans, with the tables service a plan
  // reads: MarkdownMessage brings them when an answer has one (Home's phone
  // card and the command host show AI text).
  "components/charts/SvgChart.tsx",
  "components/ai/AgentQueryPlan.tsx",
  "services/tableService.ts",
  // A late command answer's card (components/command/GlobalCommandHost).
  "components/command/BlockKitCard.tsx",
  // The invite form and its people picker, fetched when the dialog first
  // opens (components/invite/LazyMemberInviteDialog).
  "components/invite/InviteForm.tsx",
  "components/admin/PeopleFrame.tsx",
  // Web push's SDK, fetched once the first screen has settled (components/fcm/FCMHandler).
  "lib/firebase.ts",
  // The keys tip, fetched only when it may show: once per browser, on a
  // computer, once the first screen has settled (components/onboarding/KeysTipLoader).
  // Home's demo guide marks it seen through components/onboarding/keysTip.
  "components/onboarding/KeyboardTip.tsx",
  // Your profile's sections, which the profile menu warms once the first
  // screen has settled (components/profile/profileSections, fluid-14).
  "components/profile/ProfileSettingsSections.tsx",
  // The realtime connection and its handlers (267 KB of source): the light
  // provider gives the context at once and starts them at the first idle
  // moment (components/mqtt/RealtimeEngine, fluid-15).
  "components/mqtt/RealtimeEngine.tsx",
  "hooks/useMqttConnection.ts",
  "hooks/useMqttMessageHandler.ts",
  "hooks/useMessageSyncManager.ts",
  // Split view's pane, its pills and its arrange layer, with the shared drag
  // and FLIP the layer brings (@dnd-kit): they load with the first pane
  // (components/split/lazy), so a person who never splits downloads none.
  "components/split/SplitPane.tsx",
  "components/split/SplitArrange.tsx",
  "components/split/TuckedViews.tsx",
  "components/split/FocusPill.tsx",
  "lib/ui/dnd.ts",
  "lib/flip.ts",
]
const ROOT_LAZY = [
  // The realtime provider and its handlers: the offline notice reads the
  // connection's state from components/mqtt/mqttContext.
  "components/mqtt/mqttProvider.tsx",
  "hooks/useMqttMessageHandler.ts",
  // A signed-in person's saved theme, applied after hydration, and the API
  // client it brought (components/providers/ClientProviders).
  "components/activeTheme/ThemeSync.tsx",
  "services/endPoints.ts",
  "hooks/useFetch.ts",
  // The settings UI: the unsaved-changes guard takes its event from lib/unsavedChanges.
  "components/ui/settingsSection.tsx",
  // Split view's state and its rules for many views: the shell adds the slice
  // (hooks/useSplitView); it rode in every page's store before.
  "store/slice/splitSlice.ts",
  "lib/splitLayout.ts",
  // The task types and their form schema, with zod (20 Oct): six files that
  // name a task's type brought it as a value, 11,190 bytes on every route.
  // A type comes in with `import type`; the task's scales are types/taskScale.
  "types/task.ts",
]

const AI_ONLY = new Set(["components/ai/AgentQueryPlan.tsx"])

describe("the shell's first screen", () => {
  it("leaves its rare pieces to chunks of their own", () => {
    const reached = walk(firstScreenEntries(ENTRIES)).files as Map<string, string | null>
    expect(SHELL_LAZY.filter((f) => reached.has(f)).map((f) => chainOf(reached, f))).toEqual([])
    // Each is a file that exists: a list naming files that went away would pass for nothing.
    expect(SHELL_LAZY.filter((f) => !existsSync(f) && (AI_EDITION || !AI_ONLY.has(f)))).toEqual([])
  })

  it("brings none of the signed-in app to a page anyone may open", () => {
    const reached = walk(["app/layout.tsx"]).files as Map<string, string | null>
    expect(ROOT_LAZY.filter((f) => reached.has(f)).map((f) => chainOf(reached, f))).toEqual([])
    expect(ROOT_LAZY.filter((f) => !existsSync(f))).toEqual([])
  })
})

// The API client (28 Oct 2026). lib/axiosInstance is on nearly every page,
// public ones included, and it imported the Redux store only to tell a slice
// nobody read about each session refresh. That brought every slice with it: a
// guest's room page (r/[slug]) carried 303 KB of source it never ran.
describe("the API client", () => {
  it("brings no Redux store: a page that uses one brings it itself", () => {
    const reached = reach("lib/axiosInstance.ts")
    expect([...reached.keys()].filter((f) => f.startsWith("store/")).map((f) => chainOf(reached, f))).toEqual([])
  })
})

// The Redux store outside the app (29 Oct 2026). The API client let go of it,
// but the root layout's providers still held it, so the chunks every page
// loads carried every slice, redux-persist and react-redux: a guest's room
// page among them. /app's layout provides it (app/app/ClientProviders). A part
// that also shows outside /app and reads it brings it: every component its
// module exports is components/providers/StoreProvider around the part. A
// reader with no provider above it throws as it draws, so every file Next
// draws outside /app is walked, following import() too (a chunk fetched later
// still draws under the page's providers), up to the parts that bring it.
const DRAWN = /^(page|layout|template|loading|error|not-found|global-error|default)\.tsx$/
const REDUX = /^(react-redux|redux-persist|@reduxjs\/toolkit|redux)(\/|$)/
/** The parts outside /app that read the store, and so bring it. */
const STORE_BOUNDARIES = [
  "components/guest/GuestDoc.tsx", // a shared doc's editor and comments (guest/d)
  "components/livekit/VideoConference.tsx", // a guest's call (r/[slug], guest/m): useConfirm
  "components/project/timeline/ProjectTimeline.tsx", // a client's timeline (guest/p): the task open in its panel
]
// The one import of the store outside them: signing out (the sign-out page, and
// the menus' Sign out) names it for the reset it registers with endSession, and
// reads nothing from it.
const SIGN_OUT: [string, string] = ["hooks/useLogout.ts", "store/store.ts"]

const bringsStore = new Map<string, boolean>()
/** Whether every component `file` exports is <StoreProvider> around its part, and nothing more. */
function bringsTheStore(file: string): boolean {
  let yes = bringsStore.get(file)
  if (yes !== undefined) return yes
  yes = false
  if (sourceOf(file).includes("@/components/providers/StoreProvider")) {
    const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const exported = (s: ts.Statement) => ts.canHaveModifiers(s) && (ts.getModifiers(s) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    const bodies = sf.statements.flatMap((s): ts.ConciseBody[] => {
      if (!exported(s)) return []
      if (ts.isFunctionDeclaration(s)) return s.body && (!s.name || /^[A-Z]/.test(s.name.text)) ? [s.body] : []
      if (!ts.isVariableStatement(s)) return []
      return s.declarationList.declarations.flatMap((d) =>
        ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? [d.initializer.body] : [],
      )
    })
    const drawn = (body: ts.ConciseBody): ts.Expression | undefined => {
      if (!ts.isBlock(body)) return body
      const [only, ...rest] = body.statements
      return rest.length === 0 && only && ts.isReturnStatement(only) ? only.expression : undefined
    }
    yes =
      bodies.length > 0 &&
      bodies.every((body) => {
        let e = drawn(body)
        while (e && ts.isParenthesizedExpression(e)) e = e.expression
        return !!e && ts.isJsxElement(e) && e.openingElement.tagName.getText(sf) === "StoreProvider"
      })
  }
  bringsStore.set(file, yes)
  return yes
}

describe("the Redux store outside the app", () => {
  it("is reached only through the parts that read it, each bringing it at its root", () => {
    const through = new Set<string>()
    const follow = (file: string, from: string): boolean => {
      if (bringsTheStore(file)) {
        through.add(file)
        return false
      }
      return !(from === SIGN_OUT[0] && file === SIGN_OUT[1])
    }
    const found = pagesAndLayouts("app", DRAWN)
      .filter((f) => !f.startsWith("app/app/"))
      .flatMap((entry) => {
        const { files, packages } = walk(firstScreenEntries([entry]), { dynamic: true, follow }) as { files: Map<string, string | null>; packages: Array<[string, string]> }
        return [
          ...[...files.keys()].filter((f) => f.startsWith("store/")).map((f) => chainOf(files, f)),
          ...packages.filter(([spec]) => REDUX.test(spec)).map(([spec, file]) => `${spec}: ${chainOf(files, file)}`),
        ]
      })
    expect(found).toEqual([])
    expect([...through].sort()).toEqual(STORE_BOUNDARIES)
  })
})

// The green rooms (29 Oct 2026). A guest's room page loaded LiveKit's client
// before anything was clicked: 137 KB of its 464 KB of scripts (gzip), through
// the camera preview (PreJoin) and the stage's pieces (CallStage). The preview
// asks for the client as it mounts, and a tile's LiveKit pieces live with the
// tile (StageTile), in the call's own chunk.
describe("a green room's first load", () => {
  it("brings no LiveKit: the call's client comes after the page", () => {
    const rooms = ["app/r/[slug]/page.tsx", "app/guest/m/[token]/page.tsx", "app/app/meet/join/r/[slug]/page.tsx"]
    const livekit = /^(livekit-client|@livekit\/)/
    expect(
      rooms.flatMap((room) => {
        const { files, packages } = walk([room]) as { files: Map<string, string | null>; packages: Array<[string, string]> }
        return packages.filter(([spec]) => livekit.test(spec)).map(([spec, file]) => `${room}: ${spec}: ${chainOf(files, file)}`)
      }),
    ).toEqual([])
  })
})

// The trash's first screen (docs F1b, 21 Oct 2026): it named a doc with the
// docs home rows' titleOf and drew their skeleton through the home's list, so
// it carried those rows, their menu and the list, 111 KB of source. It takes
// both from small modules (lib/docs/docTitle, components/doc/docSkeletons).
describe("the trash's first screen", () => {
  it("doesn't carry the docs home's rows, their menu or its list", () => {
    const reached = reach("app/app/doc/trash/page.tsx")
    const home = ["components/doc/docRows.tsx", "components/docTree/DocRowMenu.tsx", "components/doc/docListResult.tsx"]
    expect(home.filter((f) => reached.has(f)).map((f) => chainOf(reached, f))).toEqual([])
  })
})

// The recordings lists' first screen (25 Oct 2026): the date range field's
// phone sheet brought the shared drawer, 19 KB of source with what it brings,
// though only a phone opening the field needs it. The sheet is a chunk of its
// own (components/dateRangePicker/dateRangeSheet).
describe("the recordings lists' first screen", () => {
  it("leaves the shared drawer to the date field's sheet", () => {
    const lists = [
      "app/app/recordings/page.tsx",
      "app/app/channel/[channel-id]/recording/page.tsx",
      "app/app/chat/[chat-id]/recording/page.tsx",
      "app/app/chat/group/[chat-grp-id]/recording/page.tsx",
    ]
    const drawer = "components/ui/drawer.tsx"
    expect(lists.flatMap((r) => {
      const reached = reach(r)
      return reached.has(drawer) ? [chainOf(reached, drawer)] : []
    })).toEqual([])
  })
})

// Every route's ceilings (17 Oct 2026): one table, scripts/fluidity/route-ceilings.json,
// with a line for every page and layout. The source ceilings are held here, on
// every quick check and with no build; the gzip ceilings are held by
// scripts/fluidity/routes.mjs --check after a production build. Both only go
// down: make what a route brings lazy rather than raising its line.
describe("every route's ceilings", () => {
  const files = pagesAndLayouts("app").sort()

  it("has a line for every page and layout, and none for a file that's gone", () => {
    expect(files.filter((f) => typeof CEILINGS.routes[f]?.source !== "number"), "add a line to scripts/fluidity/route-ceilings.json (routes.mjs --propose prints it)").toEqual([])
    // A page only the AI edition has keeps its line in the edition without AI.
    expect(Object.keys(CEILINGS.routes).filter((f) => !existsSync(f) && (AI_EDITION || CEILINGS.routes[f].edition !== "ai"))).toEqual([])
  })

  // Each line is its measure plus headroom (routes.mjs headroom: max(2 KB, 1%)), never rises, and is ratcheted down
  // when its route shrinks by more than that (main's V-49 amendment, 29 Oct 2026).
  it("keeps every page and layout under its source line, and no line more than twice its headroom above its measure", () => {
    const problems = files.flatMap((f) => {
      const problem = lineProblem("source", sourceMeasure(f), CEILINGS.routes[f]?.source ?? 0) as string | null
      return problem ? [`${f}: ${problem}`] : []
    })
    expect(problems).toEqual([])
  })
})
