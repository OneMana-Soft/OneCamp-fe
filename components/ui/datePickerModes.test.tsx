import * as React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { pinTestClock } from "@/lib/testing/testClock"
import { SCREENS, putOnScreen, mediaMatches, type ScreenName } from "@/lib/testing/screens"
import { SHEET_QUERY } from "@/components/ui/overlay"
import { DateField, TimeField } from "@/components/ui/date-field"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"

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
// popover, a sheet), on a phone in portrait and in landscape, a tablet and a
// computer.

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

type Host = "page" | "dialog" | "popover" | "sheet"

/** Every form that asks for a date or a time, where its field sits, read from its file below. */
const FORMS: Array<{ file: string; host: Host; field: "DateField" | "TimeField" | "DatePicker" }> = [
  { file: "app/f/[token]/page.tsx", host: "page", field: "DateField" },
  { file: "app/invoice/[project]/page.tsx", host: "page", field: "DateField" },
  { file: "components/calendar/bookingSettings.tsx", host: "page", field: "TimeField" },
  { file: "components/calendar/repeat/customRepeatSheet.tsx", host: "dialog", field: "DateField" },
  { file: "components/checkins/ChannelCheckIns.tsx", host: "dialog", field: "TimeField" },
  { file: "components/dialog/createProjectDialog.tsx", host: "dialog", field: "DateField" },
  { file: "components/dialog/updateUserStatusDialog.tsx", host: "sheet", field: "DateField" },
  { file: "components/dialog/updateUserStatusDialog.tsx", host: "sheet", field: "TimeField" },
  { file: "components/notifications/NotificationPreferencesCard.tsx", host: "page", field: "TimeField" },
  { file: "components/task/cyclesSwitcher.tsx", host: "page", field: "DateField" },
  { file: "components/task/taskDateField.tsx", host: "page", field: "DatePicker" },
  { file: "components/task/taskTimeSection.tsx", host: "page", field: "DateField" },
]

/** A field, as the form writes it, in what holds it. */
function Form({ host, kind, onChange }: { host: Host; kind: "date" | "time"; onChange: (v: string) => void }) {
  const [value, setValue] = React.useState(kind === "date" ? "2026-10-20" : "09:30")
  const field =
    kind === "date" ? (
      <DateField aria-label="Clears on" value={value} onChange={(v) => (setValue(v), onChange(v))} />
    ) : (
      <TimeField aria-label="Clears at" value={value} onChange={(v) => (setValue(v), onChange(v))} />
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
    it(`${f.file}: its ${f.field}, ${f.host === "page" ? "on its page" : `in its ${f.host}`}`, () => {
      const src = readFileSync(join(__dirname, "../..", f.file), "utf8")
      expect(src).toMatch(/(from|import\()\s*["']@\/components\/ui\/date-field["']/)
      expect(src).toMatch(new RegExp(`<${f.field}\\b`))
      expect(src, "a browser date or time box").not.toMatch(/type=["'](date|time|datetime-local)["']/)
    })
  }
})

const MODES: ScreenName[] = ["a phone in portrait", "a phone in landscape", "a tablet", "a computer"]
const HOSTS: Host[] = Array.from(new Set(FORMS.map((f) => f.host)))

for (const mode of MODES) {
  const phone = mode.startsWith("a phone")
  describe(`on ${mode}`, () => {
    for (const host of HOSTS) {
      for (const kind of ["date", "time"] as const) {
        const forms = FORMS.filter((f) => f.host === host).map((f) => f.file.split("/").pop()).join(", ")
        it(`opens the ${kind} ${phone ? (host === "sheet" ? "as a panel of the sheet" : "in a sheet of its own") : "by its field"}, ${host === "page" ? "on a page" : `in a ${host}`} (${forms})`, { timeout: 20000 }, async () => {
          undo = putOnScreen(SCREENS[mode])
          const change = vi.fn()
          render(<Form host={host} kind={kind} onChange={change} />)
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
          // A pick closes it and gives the value.
          const open = (kind === "date" ? screen.queryByRole("grid") : screen.queryByRole("listbox", { name: "Time" })) ?? (await opened(kind))
          const pick =
            kind === "date"
              ? Array.from(open.querySelectorAll<HTMLElement>("button")).find((b) => b.textContent?.trim() === "22")
              : (open.querySelector<HTMLElement>("[aria-selected='true']")?.nextElementSibling as HTMLElement | null)
          fireEvent.click(pick!)
          await act(async () => {})
          expect(change).toHaveBeenCalledWith(kind === "date" ? "2026-10-22" : "09:45")
        })
      }
    }
  })
}
