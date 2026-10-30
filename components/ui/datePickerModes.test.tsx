import * as React from "react"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { SCREENS, putOnScreen, mediaMatches, type ScreenName } from "@/lib/testing/screens"
import { SHEET_QUERY } from "@/components/ui/overlay"
import { DateField, TimeField } from "@/components/ui/date-field"
import { DateTimeField } from "@/components/ui/date-time-field"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { resolve as resolveImport } from "../../scripts/fluidity/reach.mjs"

// The owner, 18 Oct: "in case of custom date time picker in status we get
// popup in mobile why cant we use date time picker drawer?" On a phone in
// portrait the day and the time opened as a second, untitled sheet stacked
// over the status sheet, which read as a popup over the drawer; in landscape,
// and on every touch screen 640px or wider, as popovers over the popover, run
// off the top of the screen (design/drawers-v3/ANALYSIS.md §1.5). Every date
// and time the app asks for opens the shared pickers, so they are fixed once:
//
//   where overlays float (a computer, a tablet)   a popover by the field
//   on a phone, in a sheet already                a panel of that sheet, with
//                                                 Back and the field's name
//   on a phone, anywhere else                     a sheet of its own, titled
//
// Each form that asks for one is tested where it sits (a page, a dialog, a
// popover, a sheet, a menu), on a phone in portrait and in landscape, a
// tablet and a computer. A moment (a day and a time) is the two fields in one
// DateTimeField: Pause until, Remind me, Schedule send and Send later were
// the browser's datetime-local box, mm/dd/yyyy with its own clock, until 21
// Oct. No form keeps a browser box (app/interaction.test.ts rule 11 holds
// the whole tree to it).

pinTestClock()
const LOAD = { timeout: 8000 }
let undo: (() => void) | null = null
afterEach(async () => {
  cleanup()
  undo?.()
  undo = null
  // Radix takes a focus scope off its stack a tick after it unmounts: let it,
  // or the next test's dialog still traps the focus its popover takes.
  await new Promise((r) => setTimeout(r, 10))
})

type Host = "page" | "dialog" | "popover" | "sheet" | "menu"
type Field = "DateField" | "TimeField" | "DatePicker" | "DateTimeField"

/**
 * Every form that asks for a date or a time, where its field sits, read from
 * its file below. `via`: the form that opens it, where the field is written
 * in a file it loads (Remind me, loaded as it is chosen; Schedule send's
 * custom time, shared by the Reschedule popover and the composer's menu).
 */
const FORMS: Array<{ file: string; host: Host; field: Field; via?: string }> = [
  { file: "app/invoice/[project]/page.tsx", host: "page", field: "DateField" },
  { file: "components/calendar/bookingEditor.tsx", host: "page", field: "TimeField" },
  { file: "components/calendar/form/eventForm.tsx", host: "sheet", field: "DateField" },
  { file: "components/calendar/repeat/customRepeatSheet.tsx", host: "dialog", field: "DateField" },
  // Propose a new time: the event's panel and the guest's own page, loaded as it is opened.
  { file: "components/calendar/rsvp/proposals.tsx", via: "components/calendar/rsvp/proposalsChunk.ts", host: "page", field: "DateField" },
  { file: "components/calendar/rsvp/proposals.tsx", via: "components/calendar/rsvp/proposalsChunk.ts", host: "page", field: "TimeField" },
  { file: "components/calendar/workingHours/workingHoursSection.tsx", host: "page", field: "TimeField" },
  { file: "components/checkins/ChannelCheckIns.tsx", host: "dialog", field: "TimeField" },
  { file: "components/dialog/createProjectDialog.tsx", host: "dialog", field: "DateField" },
  { file: "components/dialog/updateUserStatusDialog.tsx", host: "sheet", field: "DateTimeField" },
  { file: "components/forms/FormPages.tsx", host: "page", field: "DateField" },
  { file: "components/forms/FormPages.tsx", host: "dialog", field: "DateField" },
  { file: "components/notifications/NotificationPreferencesCard.tsx", host: "page", field: "TimeField" },
  { file: "components/table/fields/FieldSettings.tsx", host: "popover", field: "DateField" },
  { file: "components/table/rules/RuleMenus.tsx", via: "components/table/ViewRulesBar.tsx", host: "popover", field: "DateField" },
  { file: "components/task/cyclesSwitcher.tsx", host: "page", field: "DateField" },
  { file: "components/task/taskDateField.tsx", host: "page", field: "DatePicker" },
  { file: "components/task/taskTimeSection.tsx", host: "page", field: "DateField" },
  { file: "components/work/approvals/AskApprovalSheet.tsx", host: "dialog", field: "DateField" },
  { file: "components/work/approvals/AskApprovalSheet.tsx", host: "dialog", field: "TimeField" },
  { file: "components/work/backlog/ScheduleDialog.tsx", host: "dialog", field: "DateField" },
  // A milestone's target day (linear-16).
  { file: "components/work/milestones/MilestoneDialog.tsx", host: "dialog", field: "DateField" },
  { file: "components/work/rules/RuleBuilder.tsx", host: "dialog", field: "TimeField" },
  { file: "components/notifications/PauseNotificationsDialog.tsx", host: "sheet", field: "DateTimeField" },
  { file: "components/later/reminderPicker.tsx", via: "components/later/SaveForLater.tsx", host: "sheet", field: "DateTimeField" },
  { file: "components/messages/scheduleSendButton.tsx", host: "popover", field: "DateTimeField" },
  { file: "components/messages/scheduleSendButton.tsx", via: "components/messages/scheduledMessagesBar.tsx", host: "popover", field: "DateTimeField" },
  { file: "components/messages/scheduleSendButton.tsx", via: "components/textInput/composerTools.tsx", host: "menu", field: "DateTimeField" },
]

/** The module each field comes from. */
const MODULE: Record<Field, string> = { DateField: "date-field", TimeField: "date-field", DatePicker: "date-field", DateTimeField: "date-time-field" }
/** A browser date or time box, in any of its forms. */
const BOX = /\btype=\{?["'`](?:date|time|datetime-local|month|week)["'`]/

const ROOT = join(__dirname, "../..")
const read = (file: string) => readFileSync(join(ROOT, file), "utf8")
/** The files `file` imports, by import, import() or a re-export. */
function importsOf(file: string): string[] {
  const specs = [...read(file).matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1])
  return specs.map((s) => resolveImport(s, file)).filter((f): f is string => !!f)
}

/** A field, as the form writes it, in what holds it: one field, or a day and a time together (`pair`). */
function Form({ host, kind, pair, onChange }: { host: Host; kind: "date" | "time"; pair: boolean; onChange: (v: string) => void }) {
  const [value, setValue] = React.useState(pair ? "2026-10-20T09:30" : kind === "date" ? "2026-10-20" : "09:30")
  const set = (v: string) => (setValue(v), onChange(v))
  const field = pair ? (
    <DateTimeField aria-label="Clears" labels={["Clears on", "Clears at"]} value={value} onChange={set} />
  ) : kind === "date" ? (
    <DateField aria-label="Clears on" value={value} onChange={set} />
  ) : (
    <TimeField aria-label="Clears at" value={value} onChange={set} />
  )
  if (host === "dialog")
    return (
      <Dialog open>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>The form</DialogTitle>
          {field}
        </DialogContent>
      </Dialog>
    )
  if (host === "popover")
    return (
      <Popover open>
        <PopoverTrigger>The form</PopoverTrigger>
        <PopoverContent aria-label="The form">{field}</PopoverContent>
      </Popover>
    )
  if (host === "sheet")
    return (
      <Drawer open>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>The form</DrawerTitle>} footer={<button type="button">Set status</button>}>
          {field}
        </DrawerContent>
      </Drawer>
    )
  // A menu's content swapped for the field, its keys its own (the composer's Send later).
  if (host === "menu")
    return (
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger>The form</DropdownMenuTrigger>
        <DropdownMenuContent aria-label="The form">
          <div onKeyDown={(e) => e.stopPropagation()}>{field}</div>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  return field
}

const sheets = () => Array.from(document.querySelectorAll<HTMLElement>("[data-vaul-drawer]"))

async function opened(kind: "date" | "time") {
  fireEvent.click(screen.getByRole("button", { name: kind === "date" ? /^Clears on/ : /^Clears at/ }))
  return kind === "date" ? screen.findByRole("grid", {}, LOAD) : screen.findByRole("listbox", { name: "Time" }, LOAD)
}

describe("the phone rule", () => {
  it("is a phone in portrait or in landscape, never a tablet or a computer", () => {
    expect(mediaMatches(SHEET_QUERY, SCREENS["a phone in portrait"])).toBe(true)
    expect(mediaMatches(SHEET_QUERY, SCREENS["a phone in landscape"])).toBe(true)
    expect(mediaMatches(SHEET_QUERY, SCREENS["a tablet"])).toBe(false)
    expect(mediaMatches(SHEET_QUERY, SCREENS["a computer"])).toBe(false)
    // A short window with a mouse keeps its popovers (with the footer pinned).
    expect(mediaMatches(SHEET_QUERY, { width: 1280, height: 480, coarse: false })).toBe(false)
  })
})

describe("every form's day and time come from the shared pickers", () => {
  for (const f of FORMS) {
    it(`${f.via ?? f.file}: its ${f.field}, ${f.host === "page" ? "on its page" : `in its ${f.host}`}`, () => {
      const src = read(f.file)
      expect(src).toMatch(new RegExp(`(from|import\\()\\s*["']@/components/ui/${MODULE[f.field]}["']`))
      expect(src).toMatch(new RegExp(`<${f.field}\\b`))
      expect(src, "a browser date or time box").not.toMatch(BOX)
      if (f.via) {
        expect(importsOf(f.via), `${f.via} opens ${f.file}`).toContain(f.file)
        expect(read(f.via), "a browser date or time box").not.toMatch(BOX)
      }
    })
  }

  // The list is every form: a file that asks for a day or a time joins it.
  it("lists every form that writes a field", () => {
    const listed = new Set(FORMS.map((f) => f.file))
    const unlisted: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (name === "node_modules" || name.startsWith(".")) continue
        const rel = join(dir, name)
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
        else if (name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(name) && !rel.startsWith("components/ui/") && !listed.has(rel)) {
          if (/<(DateField|TimeField|DatePicker|DateTimeField)\b/.test(read(rel))) unlisted.push(rel)
        }
      }
    }
    for (const dir of ["app", "components"]) walk(dir)
    expect(unlisted, "add these to FORMS, with where the field sits").toEqual([])
  })
})

const MODES: ScreenName[] = ["a phone in portrait", "a phone in landscape", "a tablet", "a computer"]
/** Each place a field sits, and whether a form there asks for one field or a day and a time together. */
const CASES = Array.from(new Set(FORMS.map((f) => `${f.host} ${f.field === "DateTimeField" ? "pair" : "one"}`))).map((c) => {
  const [host, way] = c.split(" ")
  return { host: host as Host, pair: way === "pair" }
})

for (const mode of MODES) {
  const phone = mode.startsWith("a phone")
  describe(`on ${mode}`, () => {
    for (const { host, pair } of CASES) {
      for (const kind of ["date", "time"] as const) {
        const forms = FORMS.filter((f) => f.host === host && (f.field === "DateTimeField") === pair).map((f) => (f.via ?? f.file).split("/").pop())
        const what = pair ? `a moment's ${kind}` : `the ${kind}`
        it(`opens ${what} ${phone ? (host === "sheet" ? "as a panel of the sheet" : "in a sheet of its own") : "by its field"}, ${host === "page" ? "on a page" : `in a ${host}`} (${[...new Set(forms)].join(", ")})`, { timeout: 20000 }, async () => {
          undo = putOnScreen(SCREENS[mode])
          const change = vi.fn()
          render(<Form host={host} kind={kind} pair={pair} onChange={change} />)
          const before = sheets()
          const list = await opened(kind)
          if (!phone) {
            expect(list.closest("[data-radix-popper-content-wrapper]"), "a popover by the field").not.toBeNull()
            expect(sheets()).toEqual(before)
          } else if (host === "sheet") {
            // One sheet: the picker is a panel of it, with Back and the field's name; the footer stays.
            expect(sheets()).toEqual(before)
            expect(list.closest("[data-sheet-panel]"), "a panel of the sheet").not.toBeNull()
            expect(list.closest("[data-vaul-drawer]")).toBe(before[0])
            expect((await screen.findByRole("button", { name: "Back" }, { timeout: 8000 }))).toBeTruthy()
            expect((await screen.findByRole("heading", { name: kind === "date" ? "Clears on" : "Clears at" }, { timeout: 8000 }))).toBeTruthy()
            expect(screen.getByRole("button", { name: "Set status" })).toBeTruthy()
            // Escape closes the panel, not the sheet; Back does the same.
            fireEvent.keyDown(list, { key: "Escape" })
            await act(async () => {})
            expect(document.querySelector("[data-sheet-panel]")).toBeNull()
            expect(sheets()[0]?.getAttribute("data-state")).toBe("open")
            await opened(kind)
            fireEvent.click((await screen.findByRole("button", { name: "Back" }, { timeout: 8000 })))
            await act(async () => {})
            expect(document.querySelector("[data-sheet-panel]")).toBeNull()
          } else {
            // A sheet of its own, titled with the field's name, never a popover over the form.
            const own = list.closest<HTMLElement>("[data-vaul-drawer]")
            expect(own, "a sheet").not.toBeNull()
            expect(before).not.toContain(own)
            expect(list.closest("[data-radix-popper-content-wrapper]")).toBeNull()
            const title = own!.querySelector("[data-sheet-header]")
            expect(title?.textContent).toContain(kind === "date" ? "Clears on" : "Clears at")
            expect(title?.querySelector(".sr-only")).toBeNull()
          }
          // A pick closes it and gives the value: the day or the time, or the moment it makes.
          const open = (kind === "date" ? screen.queryByRole("grid") : screen.queryByRole("listbox", { name: "Time" })) ?? (await opened(kind))
          const pick =
            kind === "date"
              ? Array.from(open.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "22")
              : (open.querySelector<HTMLElement>("[aria-selected='true']")?.nextElementSibling as HTMLElement | null)
          fireEvent.click(pick!)
          await act(async () => {})
          const picked = kind === "date" ? "2026-10-22" : "09:45"
          expect(change).toHaveBeenCalledWith(pair ? (kind === "date" ? `${picked}T09:30` : `2026-10-20T${picked}`) : picked)
        })
      }
    }
  })
}
