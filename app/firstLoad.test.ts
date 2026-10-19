import { describe, expect, it } from "vitest"
import { existsSync, readdirSync, readFileSync } from "fs"
import path from "path"

import { chainOf, reach as reachFrom, sourceBytes as bytesOf, walk } from "../scripts/fluidity/reach.mjs"

// What a visitor's first screen downloads. A new visitor waited 8 to 9
// seconds for Home, a good part of it on code Home never runs: the editor
// (ProseMirror, Yjs, code highlighting) came in through the thread panel in
// the app's layout, and the MQTT client through the realtime provider. They
// load when they're needed now. This walks the static imports from the
// layouts and Home (a dynamic import() starts a chunk of its own, so it isn't
// followed) and fails, naming the chain, if one of them is reached again.

// Firebase (17 Oct 2026): web push's SDK came with every signed-in first
// screen through components/fcm/FCMHandler; it is fetched once the page is idle.
const HEAVY = ["@tiptap/", "prosemirror-", "yjs", "y-prosemirror", "lowlight", "highlight.js", "mqtt", "framer-motion", "livekit-client", "@livekit/", "firebase/"]
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
  const { files, packages } = walk(entries) as { files: Map<string, string | null>; packages: Array<[string, string]> }
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

  it("would see one: the composer, walked from, brings the editor", () => {
    expect(heavyReach(["components/textInput/textInput.tsx"]).some((r) => r.startsWith("@tiptap/"))).toBe(true)
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
  "components/projectTemplates/SaveAsTemplateDialog.tsx",
  "components/task/cycleBurndownDialog.tsx",
  "components/charts/SvgChart.tsx",
  "components/task/taskCreateForm.tsx",
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
  "lib/goals.ts",
  // The number reader: a field's value is read where it is typed, in the task
  // panel (lib/tasks/fieldInput), never where a list shows it (17d, 16 Oct:
  // through lib/tasks/fields it took the route 1,160 B over its ceiling).
  "lib/format/number.ts",
  // The bursts (17 Oct 2026): a finish is noted at once (lib/celebrateSoon),
  // and its sparks come from lib/celebrate, fetched when the page is idle.
  "lib/celebrate.ts",
]
/**
 * Bytes of source the project route reaches by static import: 1.61 MB before
 * the split, 0.95 MB after, 0.93 MB once the toolbar's menus were chunks. The
 * ceiling lives in the one table (scripts/fluidity/route-ceilings.json).
 */
const PROJECT_ROUTE_SOURCE_CEILING = sourceCeiling(PROJECT_ROUTE)

/** The files a route reaches by static import, each with the file that brought it. */
const reach = (entry: string): Map<string, string | null> => reachFrom(entry) as Map<string, string | null>

/** Bytes of source a route reaches by static import. */
const sourceBytes = (reached: Map<string, string | null>): number => bytesOf(reached) as number

describe("a project's first screen", () => {
  const reached = reach(PROJECT_ROUTE)
  it("loads the list only: other tabs, the phone's page and the dialogs are chunks of their own", () => {
    expect(PROJECT_LAZY.filter((f) => reached.has(f))).toEqual([])
  })

  it("keeps the source it pulls in under its ceiling", () => {
    const bytes = sourceBytes(reached)
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
 * names the calendar.
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
    const bytes = sourceBytes(reached)
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
      const bytes = sourceBytes(reach(route))
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
]
/**
 * 1,547,717 bytes before the chain (b18j, 18 Oct 2026); 1,634,372 when it landed;
 * 1,635,087 once P-SPEED's MQTT context split met it (a recorded one-off);
 * 1,194,825 after T3's trim. The line lives in the one table,
 * scripts/fluidity/route-ceilings.json.
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
    const bytes = sourceBytes(reached)
    expect(bytes, `the table route reaches ${bytes} bytes of source (ceiling ${TABLE_ROUTE_SOURCE_CEILING})`).toBeLessThanOrEqual(TABLE_ROUTE_SOURCE_CEILING)
  })
})

// The celebrations' bursts (17 Oct 2026): every screen calls them through
// lib/celebrateSoon, which notes a finish at once and fetches lib/celebrate
// (the sparks and rings, 10 KB) when the page is idle. No page or layout
// brings it with its first screen; My Tasks' board and phone row included.
/** Every page and layout under `dir`, as repository paths. */
const pagesAndLayouts = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? pagesAndLayouts(path.join(dir, e.name)) : /^(page|layout)\.tsx$/.test(e.name) ? [path.join(dir, e.name)] : [],
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
    const bytes = sourceBytes(reached)
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

// The shell's rare pieces (17 Oct 2026, the shell diet). Every signed-in first
// screen carried them, though each is wanted only now and then; each is a
// chunk of its own now. SHELL_LAZY is held from the layouts and Home. ROOT_LAZY
// is held from the root layout alone, which every page loads, signed in or
// not: sign-in, guest, booking and invoice pages.
const SHELL_LAZY = [
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
  // Web push's SDK, fetched once the page is idle (components/fcm/FCMHandler).
  "lib/firebase.ts",
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
]

const AI_ONLY = new Set(["components/ai/AgentQueryPlan.tsx"])

describe("the shell's first screen", () => {
  it("leaves its rare pieces to chunks of their own", () => {
    const reached = walk(ENTRIES).files as Map<string, string | null>
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

  it("keeps every page and layout under its source ceiling", () => {
    const over = files
      .map((f) => ({ f, bytes: sourceBytes(reach(f)), ceiling: CEILINGS.routes[f]?.source ?? 0 }))
      .filter((r) => r.bytes > r.ceiling)
      .map((r) => `${r.f} reaches ${r.bytes} bytes of source (ceiling ${r.ceiling})`)
    expect(over).toEqual([])
  })
})
