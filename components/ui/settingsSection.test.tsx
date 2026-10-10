import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { SaveBar, SettingRow, SettingsSection, SwitchRow, sectionActionClass } from "@/components/ui/settingsSection"

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

  // The row decides by its OWN width, not the window's: in the invitation
  // email's editor column (430px on a 1440px screen) a window rule kept the
  // sender address's input beside its help, which was squeezed to 115px and ran
  // ten lines of one or two words.
  it("keeps the control on one line at the row's end when the row is wide, and below the words when it is narrow", () => {
    const { container } = render(<SettingRow label="Theme" controlId="t"><select id="t" /></SettingRow>)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toContain("@container")
    expect(row.className).not.toMatch(/(^|\s)sm:flex-row/)
    const inner = row.firstElementChild as HTMLElement
    expect(inner.className).toContain("flex-col")
    expect(inner.className).toContain("@xl:flex-row")
    expect(inner.className).toContain("@xl:items-center")
    const control = inner.lastElementChild as HTMLElement
    expect(control.className).toContain("shrink-0")
    expect(control.querySelector("select")).toBeTruthy()
  })

  it("puts a wide control (a textarea, a key to paste) under its words at full width when stacked", () => {
    const { container } = render(
      <SettingRow layout="stacked" label="Who can join" description="Emails and domains." controlId="allow">
        <textarea id="allow" />
      </SettingRow>,
    )
    const row = container.firstElementChild as HTMLElement
    expect(row.getAttribute("data-setting-row")).toBe("stacked")
    expect(row.className).not.toContain("flex-row")
    const [words, control] = Array.from(row.children) as HTMLElement[]
    expect(words.textContent).toContain("Who can join")
    expect(control.querySelector("textarea")).toBeTruthy()
    expect(screen.getByLabelText("Who can join").tagName).toBe("TEXTAREA")
  })
})

// The frame of a section: every admin tab and settings page is a stack of these,
// so the first title sits at one place on every tab and the one action sits on
// its row, where the task panel keeps "Mark complete".
describe("a settings section", () => {
  it("is a titled region whose title is a level 2 heading by default", () => {
    render(<SettingsSection title="Workspace" description="Uploads and sign-up."><p>rows</p></SettingsSection>)
    const region = screen.getByRole("region", { name: "Workspace" })
    expect(screen.getByRole("heading", { level: 2, name: "Workspace" }).className).toContain("text-base")
    expect(region.querySelector("[data-section-header]")).toBeNull()
  })

  it("puts its action on the title's row, at the end, and under the words on a phone", () => {
    render(
      <SettingsSection title="Admins" description="Who can change settings." action={<button type="button">Add admin</button>}>
        <p>rows</p>
      </SettingsSection>,
    )
    const header = screen.getByRole("region", { name: "Admins" }).querySelector("[data-section-header]") as HTMLElement
    expect(header.className).toContain("flex-col")
    expect(header.className).toContain("sm:flex-row")
    expect(header.className).toContain("sm:justify-between")
    const action = header.querySelector("[data-section-action]") as HTMLElement
    expect(action.textContent).toBe("Add admin")
    expect(action.className).toContain("shrink-0")
  })

  it("draws a section inside a section with a level 3, 14px title", () => {
    render(<SettingsSection level={3} title="Monthly receipts"><p>rows</p></SettingsSection>)
    const h = screen.getByRole("heading", { level: 3, name: "Monthly receipts" })
    expect(h.className).toContain("text-sm")
  })

  it("gives the header's action one height on every tab: 32px from md up, 44px on a phone", () => {
    expect(sectionActionClass.split(" ").sort()).toEqual(["h-11", "md:h-8"])
  })
})
