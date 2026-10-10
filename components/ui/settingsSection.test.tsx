import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { SaveBar, SettingRow, SwitchRow } from "@/components/ui/settingsSection"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const bar = (dirty = true) =>
  render(<SaveBar dirty={dirty} saving={false} onSave={() => {}} onDiscard={() => {}} what="email changes" />)

describe("the bar for unsaved changes", () => {
  it("rides a rem above the phone's bottom navigation, and 1rem from the bottom from md up", () => {
    bar()
    const region = screen.getByRole("region", { name: "Unsaved changes" })
    // On a phone the scroll area already keeps 4rem (plus the home indicator's
    // inset) free for the 3.5rem navigation, and a sticky offset counts from
    // inside it: 0.5rem more is 4.5rem from the edge. An offset that added the
    // navigation's height again floated the bar 79px over it at 390px.
    expect(region.className).toContain("sticky")
    expect(region.className).toMatch(/(^|\s)bottom-2(\s|$)/)
    expect(region.className).toContain("md:bottom-4")
    expect(region.className).not.toMatch(/bottom-\[calc/)
    const layout = readFileSync(join(__dirname, "..", "navigationBar", "mobile", "mobileNavigationBar.tsx"), "utf8")
    expect(layout).toContain("pb-[calc(4rem+env(safe-area-inset-bottom))]")
  })

  it("asks before the tab closes with changes unsaved, in every browser's way", () => {
    const add = vi.spyOn(window, "addEventListener")
    bar()
    const warn = add.mock.calls.find(([type]) => type === "beforeunload")?.[1] as (e: unknown) => void
    expect(warn).toBeTypeOf("function")
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown }
    warn(event)
    expect(event.preventDefault).toHaveBeenCalled()
    // Chrome before 119 and Safari only ask when returnValue is set.
    expect(event.returnValue).toBe("")
  })

  it("is not there, and asks nothing, with nothing to save", () => {
    const add = vi.spyOn(window, "addEventListener")
    bar(false)
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    expect(add.mock.calls.some(([type]) => type === "beforeunload")).toBe(false)
  })
})

// One rhythm for every row of a settings list, whatever its control: the task
// panel's rule (quiet help, the control on one line at the row's end, every row
// the same padding). Admin cards with a select, an input or a button each drew
// their own row, at their own padding, so a list of them read as a staircase.
describe("a setting's row", () => {
  it("ties its label to the control and its help to the control's description", () => {
    render(
      <SettingRow label="Upload limit" description="The largest file anyone can attach." controlId="upload-limit">
        <input id="upload-limit" />
      </SettingRow>,
    )
    const input = screen.getByLabelText("Upload limit")
    expect(input.getAttribute("aria-describedby")).toBeNull() // the row never rewrites its child
    const help = screen.getByText("The largest file anyone can attach.")
    expect(help.id).toBe("upload-limit-desc")
    expect(help.className).toContain("text-muted-foreground")
  })

  it("has the same padding as a switch's row, so mixed lists keep one rhythm", () => {
    const { container } = render(
      <div>
        <SettingRow label="Sender name" controlId="sender"><input id="sender" /></SettingRow>
        <SwitchRow label="Read receipts" checked={false} onChange={() => {}} />
      </div>,
    )
    const [row, switchRow] = Array.from(container.firstElementChild!.children) as HTMLElement[]
    const pad = (el: HTMLElement) => el.className.split(" ").filter((c) => /^(px|py)-/.test(c)).sort().join(" ")
    expect(pad(row)).toBe(pad(switchRow))
  })

  it("keeps the control on one line at the row's end from sm up, and below the words on a phone", () => {
    const { container } = render(<SettingRow label="Theme" controlId="t"><select id="t" /></SettingRow>)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("sm:flex-row")
    expect(row.className).toContain("sm:items-center")
    const control = row.lastElementChild as HTMLElement
    expect(control.className).toContain("shrink-0")
  })
})
