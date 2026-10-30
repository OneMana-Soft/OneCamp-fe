import { readFileSync } from "node:fs"
import { relative } from "node:path"
import { describe, expect, it } from "vitest"

import { drawsBefore, stylesheetBefore, touchBefore, touchPrimitives, type Source } from "@/lib/ui/touchBefore"
import { sourceFiles } from "@/lib/testing/sourceFiles"

/**
 * A TOUCH TARGET'S ::before IS ITS REACH ALONE (app/phone.css F3).
 *
 * Under a finger every control takes a 44 px tap through its ::before: an
 * absolute box with an inset, unlayered. A control that also drew with its
 * own ::before lost that drawing's place and size on a phone. The calendar's
 * today ring floated between two weekday letters in the phone's week strip
 * (design review, 22 Oct). A control draws with ::after, which F3 leaves
 * alone, or isn't a touch target. lib/ui/touchBefore reads the source.
 */
const ROOT = process.cwd()

const read = (p: string): Source => ({ file: relative(ROOT, p), text: readFileSync(p, "utf8") })

describe("a touch target's ::before", () => {
  it("is its 44 px reach alone: no touch target draws with ::before", () => {
    const sources = sourceFiles(["app", "components", "lib"], /\.tsx?$/).map(read)
    const sheets = sourceFiles(["app", "components"], /\.css$/).map(read)
    expect(touchBefore(sources, sheets), "draw it with ::after, or leave data-touch-target off what isn't a control").toEqual([])
  }, 60_000)

  it("finds the base controls that write data-touch-target themselves", () => {
    const ui = sourceFiles(["components/ui"], /\.tsx$/).map(read)
    const found = touchPrimitives(ui)
    for (const name of ["Button", "Checkbox", "Switch", "RadioGroupItem", "TabsTrigger", "Toggle", "ToggleGroupItem", "CornerClose"]) expect(found, name).toContain(name)
  })

  it("takes data-touch-target from the element that writes it: a component whose inner close button is the target isn't one", () => {
    // DialogContent as it was before CornerClose: its declaration wrote
    // data-touch-target on the close button inside it, so the whole sheet
    // counted as a touch target, and overlay.css's float ::before on it was
    // read as drawing on a control (wI, 24 Oct).
    const dialog: Source = {
      file: "components/ui/dialog.tsx",
      text: `export const DialogContent = React.forwardRef(function DialogContent({ className, children, ...props }, ref) {
  return (
    <DialogPrimitive.Content ref={ref} data-overlay="float" className={cn("grid", className)} {...props}>
      {children}
      <DialogPrimitive.Close data-touch-target="" className="absolute right-3 top-3" />
    </DialogPrimitive.Content>
  )
})
export const Close = (p) => (busy ? <span /> : <DialogPrimitive.Close data-touch-target="" {...p} />)`,
    }
    expect([...touchPrimitives([dialog])]).toEqual(["Close"])
    const use: Source = { file: "components/x/sheet.tsx", text: `export function S() { return <DialogContent data-overlay="float" className="before:bg-hover" /> }` }
    const sheet: Source = { file: "app/overlay.css", text: `[data-overlay="float"]::before { content: "" }` }
    expect(touchBefore([dialog, use], [sheet])).toEqual([])
    // Nor does the sheet's own drawing count against the base control beside it in its file.
    expect(touchBefore([{ ...dialog, text: dialog.text.replace(`cn("grid", className)`, `cn("grid before:bg-scrim", className)`) }], [])).toEqual([])
    // The close button inside is still a target, and is read as one.
    const drawn: Source = { ...dialog, text: dialog.text.replace(`className="absolute right-3 top-3"`, `className="absolute before:ring-2"`) }
    expect(touchBefore([drawn, use], [sheet])).toEqual(["components/ui/dialog.tsx:5 <DialogPrimitive.Close> draws with before: in its className"])
  })

  it("bites: the calendar's old today ring, a before: class on a control, and a stylesheet's ::before on a control's class", () => {
    // The ring as it was: DayCell drew today with before: utilities, and the
    // phone's week strip gave it data-touch-target.
    const cell: Source = {
      file: "components/ui/dayCell.tsx",
      text: `export const DAY_CELL_TODAY = "font-semibold before:absolute before:left-1/2 before:ring-[1.5px]"
export const DayCell = React.forwardRef(function DayCell(p, ref) { return <button ref={ref} className={cn("relative", p.today && DAY_CELL_TODAY)} /> })`,
    }
    const strip: Source = {
      file: "components/calendar/calendarApp.tsx",
      text: `import { DayCell } from "@/components/ui/dayCell"
export function Strip() { return <DayCell date={d} data-touch-target="" /> }`,
    }
    expect(touchBefore([cell, strip], [])).toEqual(["components/calendar/calendarApp.tsx:2 <DayCell> is given data-touch-target, and components/ui/dayCell.tsx draws with before:"])
    // Moved to ::after, it is found no more.
    expect(touchBefore([{ ...cell, text: cell.text.replaceAll("before:", "after:") }, strip], [])).toEqual([])

    const button: Source = { file: "components/ui/button.tsx", text: `export const Button = React.forwardRef((p, ref) => <button data-touch-target="" {...p} ref={ref} />)` }
    const use: Source = { file: "components/x/x.tsx", text: `export function X() { return <Button className="hover:before:opacity-100 before:bg-hover" /> }` }
    expect(touchBefore([button, use], [])).toEqual(["components/x/x.tsx:1 <Button> draws with before: in its className"])

    const tile: Source = { file: "components/x/tile.tsx", text: `export function T() { return <button data-touch-target="" className="tile" data-picked="" /> }` }
    const sheet: Source = { file: "app/x.css", text: `.tile::before { content: "" } [data-picked]:hover::before { content: "" } :is([data-touch-target], .shell-icon-btn)::before { inset: 0 }` }
    expect(touchBefore([tile], [sheet])).toEqual([
      "components/x/tile.tsx:1 <button> has .tile, and app/x.css: .tile::before draws ::before on it",
      "components/x/tile.tsx:1 <button> has [data-picked], and app/x.css: [data-picked]:hover::before draws ::before on it",
    ])
    // A stylesheet's valued attribute meets only the values a control can take.
    const rows: Source = { file: "app/rows.css", text: `.group > [data-press="row"]::before { content: "" }` }
    const press = (value: string): Source => ({ file: "components/x/p.tsx", text: `export function P() { return <button data-touch-target="" data-press=${value} /> }` })
    expect(touchBefore([press(`{small ? "icon" : "control"}`)], [rows])).toEqual([])
    expect(touchBefore([press(`"row"`)], [rows])).toEqual([`components/x/p.tsx:1 <button> has [data-press="row"], and app/rows.css: .group > [data-press="row"]::before draws ::before on it`])
    // F3's own reach isn't a drawing of the control's.
    expect([...stylesheetBefore([sheet]).keys()]).toEqual([".tile", "[data-picked]"])
    expect(drawsBefore("after:absolute after:ring-brand")).toBe(false)
    expect(drawsBefore("data-[open]:before:opacity-100")).toBe(true)
  })
})
