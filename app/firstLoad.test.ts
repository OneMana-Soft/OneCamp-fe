import { describe, expect, it } from "vitest"
import { existsSync, readFileSync } from "fs"
import path from "path"

// What a visitor's first screen downloads. A new visitor waited 8 to 9
// seconds for Home, a good part of it on code Home never runs: the editor
// (ProseMirror, Yjs, code highlighting) came in through the thread panel in
// the app's layout, and the MQTT client through the realtime provider. They
// load when they're needed now. This walks the static imports from the
// layouts and Home (a dynamic import() starts a chunk of its own, so it isn't
// followed) and fails, naming the chain, if one of them is reached again.

const HEAVY = ["@tiptap/", "prosemirror-", "yjs", "y-prosemirror", "lowlight", "highlight.js", "mqtt", "framer-motion", "livekit-client", "@livekit/"]
const ENTRIES = ["app/layout.tsx", "app/app/layout.tsx", "app/app/home/page.tsx"]

const importRe = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gm

function resolve(spec: string, from: string): string | null {
  let base: string
  if (spec.startsWith("@/")) base = spec.slice(2)
  else if (spec.startsWith(".")) base = path.join(path.dirname(from), spec)
  else return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(c) && !c.endsWith("/") && /\.(t|j)sx?$/.test(c)) return c
  }
  return null
}

function heavyReach(entries: string[]): string[] {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]))
  const queue = [...entries]
  const found: string[] = []
  const chain = (f: string | null): string => {
    const out: string[] = []
    while (f) {
      out.push(f)
      f = parent.get(f) ?? null
    }
    return out.join(" <- ")
  }
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const spec = m[1]
      const lib = HEAVY.find((h) => spec === h.replace(/\/$/, "") || spec.startsWith(h))
      if (lib) found.push(`${spec}: ${chain(file)}`)
      const next = resolve(spec, file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
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
]
/**
 * Bytes of source the project route reaches by static import: 1.61 MB before
 * the split, 0.95 MB after, 0.93 MB once the toolbar's menus were chunks.
 */
const PROJECT_ROUTE_SOURCE_CEILING = 935_000

function reach(entry: string): Map<string, string | null> {
  const parent = new Map<string, string | null>([[entry, null]])
  const queue = [entry]
  while (queue.length) {
    const file = queue.shift()!
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
    for (const m of src.matchAll(importRe)) {
      const next = resolve(m[1], file)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return parent
}

/** Bytes of source a route reaches by static import. */
function sourceBytes(reached: Map<string, string | null>): number {
  let bytes = 0
  for (const f of reached.keys()) bytes += readFileSync(f).length
  return bytes
}

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
// view and booking settings load on first use, fetched ahead when the page is idle
// (calendarApp.tsx); the phone's day strip draws its days without the date
// picker's library and its select (components/ui/dayCell.tsx). Its ceiling,
// set at its first measurement, only goes down; so do the public booking
// pages', which every outsider opens (CAL9).
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
  "components/calendar/bookingSettings.tsx",
  "components/ui/calendar.tsx",
  "components/ui/select.tsx",
]
/**
 * 816,537 bytes when every surface came with the grid; 760,717 after (14 Oct
 * 2026); 752,243 once the day strip stopped bringing the date picker (15 Oct);
 * 768,587 with beta's shell on 16 Oct, and 743,642 once the month view became
 * a chunk of its own.
 */
const CALENDAR_ROUTE_SOURCE_CEILING = 755_000
/**
 * The public booking pages: 219,767 and 227,303 bytes (14 Oct 2026); 241,094
 * and 248,607 with beta's load-failure states on 16 Oct; 164,761 and 172,296
 * once the gone page and the booked burst came only when wanted.
 */
const BOOKING_ROUTE_SOURCE_CEILINGS: Record<string, number> = {
  "app/book/[slug]/page.tsx": 175_000,
  "app/booking/[token]/page.tsx": 182_000,
}
/** What an outsider's booking page brings only when it is wanted: the gone or failed page, and the booked burst. */
const BOOKING_LAZY = ["components/guest/publicStates.tsx", "components/ui/load-failure-state.tsx", "lib/celebrate.ts"]

describe("the calendar's first screen", () => {
  const reached = reach(CALENDAR_ROUTE)
  it("loads the grid only: its surfaces are chunks of their own, loaded on first use", () => {
    expect(CALENDAR_LAZY.filter((f) => reached.has(f))).toEqual([])
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
