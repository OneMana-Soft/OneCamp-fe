import * as React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// On a phone the combobox's menu is a sheet (design/drawers-v3: "a sheet: the
// filter in the header, the list as the body"), never a popover floating over
// the page: a titled sheet of its own on a page or in a dialog, and a panel of
// the sheet it is in, with Back. Under a finger no row is lit while nothing is
// chosen, since a lit row with no hover to explain it reads as the choice.
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

const { Combobox, ComboboxContent, ComboboxField, ComboboxInput, ComboboxItem, ComboboxList } = await import("./combobox")
const { Drawer, DrawerContent, DrawerTitle } = await import("./drawer")

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

const PEOPLE = [
  { id: "u1", name: "Sam Rivera" },
  { id: "u2", name: "Priya Shah" },
  { id: "u3", name: "Olu Adeyemi" },
]

function Owner({ start = "", onPick = () => {} }: { start?: string; onPick?: (id: string) => void }) {
  const [id, setId] = React.useState(start)
  return (
    <Combobox>
      <ComboboxField aria-label="Owner" placeholder="Choose someone">
        {PEOPLE.find((p) => p.id === id)?.name}
      </ComboboxField>
      <ComboboxContent label="Owner" data-owner-picker="">
        <ComboboxInput placeholder="Find someone…" />
        <ComboboxList>
          {PEOPLE.map((p) => (
            <ComboboxItem
              key={p.id}
              value={p.id}
              keywords={[p.name]}
              checked={p.id === id}
              onSelect={(v) => {
                setId(v)
                onPick(v)
              }}
            >
              {p.name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const sheets = () => document.querySelectorAll("[data-v3-sheet]")

describe("the combobox on a phone", () => {
  it("opens as a sheet titled with its name, the list in the sheet's one scroller, and a pick closes it", async () => {
    const picked = vi.fn()
    render(<Owner onPick={picked} />)
    const field = screen.getByRole("combobox", { name: "Owner" })
    expect(field.getAttribute("aria-haspopup")).toBe("dialog")
    fireEvent.click(field)
    const sheet = await screen.findByRole("dialog", { name: "Owner" })
    expect(sheet.getAttribute("data-overlay")).toBe("sheet")
    expect(document.querySelector('[data-overlay="float"]')).toBeNull()
    expect(field.getAttribute("aria-expanded")).toBe("true")
    // The caller's marks reach the menu; the list doesn't scroll beside the sheet's body.
    const menu = sheet.querySelector("[data-owner-picker]")
    expect(menu).not.toBeNull()
    const list = sheet.querySelector<HTMLElement>("[cmdk-list]")!
    expect(list.className.split(/\s+/)).not.toContain("overflow-y-auto")
    expect(sheet.querySelector("[cmdk-input-wrapper]")!.className.split(/\s+/)).toContain("sticky")
    fireEvent.click(within(sheet).getByRole("option", { name: "Priya Shah" }))
    expect(picked).toHaveBeenCalledWith("u2")
    expect(field.getAttribute("aria-expanded")).toBe("false")
  })

  it("lights no row while nothing is chosen, the chosen one once something is, and the first match as you type", async () => {
    const { unmount } = render(<Owner />)
    fireEvent.click(screen.getByRole("combobox", { name: "Owner" }))
    const sheet = await screen.findByRole("dialog", { name: "Owner" })
    await within(sheet).findByRole("option", { name: "Sam Rivera" })
    expect(sheet.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(0)
    fireEvent.change(within(sheet).getByPlaceholderText("Find someone…"), { target: { value: "ol" } })
    expect(within(sheet).getByRole("option", { name: "Olu Adeyemi" }).getAttribute("data-selected")).toBe("true")
    unmount()

    render(<Owner start="u3" />)
    fireEvent.click(screen.getByRole("combobox", { name: "Owner" }))
    const again = await screen.findByRole("dialog", { name: "Owner" })
    const lit = await within(again).findByRole("option", { name: "Olu Adeyemi" })
    expect(lit.getAttribute("data-selected")).toBe("true")
    expect(again.querySelectorAll('[cmdk-item][data-selected="true"]')).toHaveLength(1)
  })

  it("in a sheet, opens as a panel of that sheet with Back, never a sheet over it", async () => {
    render(
      <Drawer open onOpenChange={() => {}}>
        <DrawerContent aria-describedby={undefined} header={<DrawerTitle>New task</DrawerTitle>}>
          <Owner />
        </DrawerContent>
      </Drawer>,
    )
    fireEvent.click(await screen.findByRole("combobox", { name: "Owner" }))
    const panel = await screen.findByRole("region", { name: "Owner" })
    expect(within(panel).getByRole("option", { name: "Sam Rivera" })).toBeTruthy()
    expect(sheets()).toHaveLength(1)
    fireEvent.click(screen.getByRole("button", { name: /Back/ }))
    expect(screen.queryByRole("region", { name: "Owner" })).toBeNull()
  })
})
