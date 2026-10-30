import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// On a phone a select's list is a sheet (design/drawers-v3: "a sheet list with
// the chosen row checked"), never a list in the page under the finger: titled
// with the select's name, no row lit while nothing is chosen, and a tap that
// picks and closes it; in a sheet it is a panel of that sheet, with Back.
vi.mock("@/components/ui/overlayMode", async (actual) => ({ ...(await actual<object>()), useSheetMode: () => true }))
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<{ default: React.ComponentType }>) => {
    const Lazy = (props: Record<string, unknown>) => {
      const [C, setC] = React.useState<React.ComponentType | null>(null)
      React.useEffect(() => {
        void load().then((m) => setC(() => m.default))
      }, [])
      return C ? <C {...props} /> : null
    }
    return Lazy
  },
}))

const { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } = await import("./select")
const { Drawer, DrawerContent, DrawerTitle } = await import("./drawer")
const { Field } = await import("./field")

beforeEach(() => {
  // A finger's pointer: the only one a phone has.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("pointer: coarse"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const ACCOUNTS = [
  { id: "999", name: "Acme" },
  { id: "1001", name: "Acme Studio" },
  { id: "1002", name: "Kite & Co" },
]

function Account({ start = "", onPick = () => {} }: { start?: string; onPick?: (id: string) => void }) {
  const [id, setId] = React.useState(start)
  return (
    <Select
      value={id}
      onValueChange={(v) => {
        setId(v)
        onPick(v)
      }}
    >
      <SelectTrigger aria-label="Basecamp account">
        <SelectValue placeholder="Choose one" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Accounts</SelectLabel>
          {ACCOUNTS.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const sheets = () => document.querySelectorAll("[data-v3-sheet]")
const lit = () => document.querySelectorAll('[role="option"]:is([data-highlighted], [data-selected="true"])')

describe("a select on a phone", () => {
  it("opens as a sheet titled with its name, and a tap picks and closes it", async () => {
    const picked = vi.fn()
    render(<Account onPick={picked} />)
    const trigger = screen.getByRole("combobox", { name: "Basecamp account" })
    fireEvent.click(trigger)
    const sheet = await screen.findByRole("dialog", { name: "Basecamp account" })
    expect(sheet.getAttribute("data-overlay")).toBe("sheet")
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(within(sheet).getByText("Accounts")).toBeTruthy()
    fireEvent.click(await within(sheet).findByRole("option", { name: "Acme Studio" }))
    expect(picked).toHaveBeenCalledWith("1001")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Basecamp account" })).toBeNull())
    expect(trigger.textContent).toContain("Acme Studio")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  it("lights no row while nothing is chosen, and opens on the chosen row, checked", async () => {
    const { unmount } = render(<Account />)
    fireEvent.click(screen.getByRole("combobox", { name: "Basecamp account" }))
    const sheet = await screen.findByRole("dialog", { name: "Basecamp account" })
    await within(sheet).findByRole("option", { name: "Kite & Co" })
    expect(lit()).toHaveLength(0)
    unmount()

    render(<Account start="1002" />)
    fireEvent.click(screen.getByRole("combobox", { name: "Basecamp account" }))
    const again = await screen.findByRole("dialog", { name: "Basecamp account" })
    const chosen = await within(again).findByRole("option", { name: "Kite & Co" })
    expect(chosen.getAttribute("aria-checked")).toBe("true")
    await waitFor(() => expect(chosen.getAttribute("data-selected")).toBe("true"))
    expect(lit()).toHaveLength(1)
  })

  // CR-27's SF2: the sheet's row dropped an item's own classes (a chart type's capitalize, a custom status's indent).
  it("keeps an item's own classes on its row", async () => {
    render(
      <Select value="" onValueChange={() => {}}>
        <SelectTrigger aria-label="Chart">
          <SelectValue placeholder="Choose one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="bar" className="capitalize">
            bar
          </SelectItem>
        </SelectContent>
      </Select>,
    )
    fireEvent.click(screen.getByRole("combobox", { name: "Chart" }))
    const row = await screen.findByRole("option", { name: "bar" })
    expect(row.className.split(" ")).toContain("capitalize")
  })

  // DESIGN-BUILD-14's M1 (24 Oct 2026): in a Field (the subscribe dialog's Country) the sheet had no title.
  it("in a Field, opens as a sheet titled with the field's label", async () => {
    render(
      <Field label="Country">
        <Select value="" onValueChange={() => {}}>
          <SelectTrigger>
            <SelectValue placeholder="Choose one" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="in">India</SelectItem>
          </SelectContent>
        </Select>
      </Field>,
    )
    fireEvent.click(screen.getByRole("combobox"))
    const sheet = await screen.findByRole("dialog")
    await within(sheet).findByRole("option", { name: "India" })
    expect(screen.getByRole("dialog", { name: "Country" })).toBe(sheet)
  })

  it("in a sheet, opens as a panel of that sheet with Back, never a sheet over it", async () => {
    render(
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>Import</DrawerTitle>}>
          <Account />
        </DrawerContent>
      </Drawer>,
    )
    fireEvent.click(await screen.findByRole("combobox", { name: "Basecamp account" }))
    const panel = await screen.findByRole("region", { name: "Basecamp account" })
    expect(await within(panel).findByRole("option", { name: "Acme" })).toBeTruthy()
    expect(sheets()).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect(screen.queryByRole("region", { name: "Basecamp account" })).toBeNull()
  })
})
