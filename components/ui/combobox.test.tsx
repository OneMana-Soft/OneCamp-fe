import { readFileSync } from "node:fs"
import * as React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxField,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "./combobox"
import { Command, CommandList } from "./command"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog"

afterEach(cleanup)

const classes = (el: Element) => (el.getAttribute("class") ?? "").split(/\s+/)

const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "MaYa", name: "Yucatec Maya" },
]

/** A single picker: the chosen row ends with its check, and choosing one closes it. */
function Language({ onPick = () => {}, start = "en" }: { onPick?: (code: string) => void; start?: string }) {
  const [code, setCode] = React.useState(start)
  const current = LANGUAGES.find((l) => l.code === code)
  return (
    <Combobox>
      <ComboboxField aria-label="Language" placeholder="Choose a language">
        {current?.name}
      </ComboboxField>
      <ComboboxContent label="Language" selected={code}>
        <ComboboxInput placeholder="Find a language…" />
        <ComboboxList>
          <ComboboxEmpty>No language by that name.</ComboboxEmpty>
          <ComboboxGroup>
            {LANGUAGES.map((l) => (
              <ComboboxItem
                key={l.code}
                value={l.code}
                keywords={[l.name]}
                checked={l.code === code}
                onSelect={(v) => {
                  setCode(v)
                  onPick(v)
                }}
              >
                {l.name}
              </ComboboxItem>
            ))}
          </ComboboxGroup>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

/** A filter: rows lead with their check, and the list stays open while ticking. */
function Projects({ onChange = () => {} }: { onChange?: (on: string[]) => void }) {
  const [on, setOn] = React.useState<string[]>([])
  return (
    <Combobox multiple>
      <ComboboxTrigger asChild>
        <button type="button">Project{on.length ? `: ${on.length}` : ""}</button>
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Project" />
        <ComboboxList>
          {["Launch", "Billing"].map((p) => (
            <ComboboxItem
              key={p}
              value={p}
              checked={on.includes(p)}
              onSelect={(v) => {
                const next = on.includes(v) ? on.filter((x) => x !== v) : [...on, v]
                setOn(next)
                onChange(next)
              }}
            >
              {p}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const open = (name: string) => fireEvent.click(screen.getByRole("combobox", { name }))
const option = (name: string) => screen.getByRole("option", { name })

describe("the combobox field", () => {
  it("is a combobox drawn as a field: design v3's surface, an input's height, the placeholder in the faint ink", () => {
    render(
      <Combobox>
        <ComboboxField aria-label="Owner" placeholder="Choose…" />
      </Combobox>,
    )
    const field = screen.getByRole("combobox", { name: "Owner" })
    expect(field.tagName).toBe("BUTTON")
    expect(field.getAttribute("type")).toBe("button")
    expect(field.className.split(/\s+/)).toEqual(expect.arrayContaining(["field-surface", "h-11", "md:h-8"]))
    expect(field.textContent).toContain("Choose…")
    expect(field.hasAttribute("data-placeholder")).toBe(true)
    expect(field.getAttribute("aria-expanded")).toBe("false")
  })

  it("shows the value it is given, with no placeholder", () => {
    render(<Language />)
    const field = screen.getByRole("combobox", { name: "Language" })
    expect(field.textContent).toContain("English")
    expect(field.hasAttribute("data-placeholder")).toBe(false)
  })

  it("takes a form's id, help and error, and a dense grid's height", () => {
    render(
      <Combobox>
        <ComboboxField id="lang" aria-describedby="lang-help" aria-invalid dense aria-label="Language" />
      </Combobox>,
    )
    const field = screen.getByRole("combobox", { name: "Language" })
    expect(field.id).toBe("lang")
    expect(field.getAttribute("aria-describedby")).toBe("lang-help")
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(field.className.split(/\s+/)).toContain("h-8")
    expect(field.className.split(/\s+/)).not.toContain("h-11")
  })

  it("reads as a panel's value when inline: plain text that tints, never a box", () => {
    render(
      <Combobox>
        <ComboboxField variant="inline" aria-label="Assignee: nobody" placeholder="Assign someone" />
      </Combobox>,
    )
    const field = screen.getByRole("combobox", { name: "Assignee: nobody" })
    expect(field.className).not.toContain("field-surface")
    expect(field.className.split(/\s+/)).toEqual(expect.arrayContaining(["-ml-2", "h-8"]))
  })

  // Beside an input on a phone its value read 14px against the input's 16px.
  it("is a field's size: 16px on a phone and 14px from md up, dense or not", () => {
    for (const dense of [false, true]) {
      render(
        <Combobox>
          <ComboboxField dense={dense} aria-label="Language" placeholder="Choose a language" />
        </Combobox>,
      )
      const c = classes(screen.getByRole("combobox", { name: "Language" }))
      expect(c).toEqual(expect.arrayContaining(["text-base", "md:text-sm"]))
      expect(c).not.toContain("text-sm")
      cleanup()
    }
  })
})

describe("a single combobox", () => {
  it("opens a named pop menu with a filter, and the field says it is open", () => {
    render(<Language />)
    open("Language")
    expect(screen.getByRole("combobox", { name: "Language" }).getAttribute("aria-expanded")).toBe("true")
    const menu = screen.getByRole("dialog", { name: "Language" })
    expect(menu.className.split(/\s+/)).toEqual(expect.arrayContaining(["p-1", "rounded-lg", "shadow-overlay"]))
    // The field names the menu it opens.
    expect(screen.getByRole("combobox", { name: "Language" }).getAttribute("aria-controls")).toBe(menu.id)
    // The filter is a combobox of its own, named by its placeholder.
    expect(within(menu).getByRole("combobox", { name: "Find a language" })).toBe(within(menu).getByPlaceholderText("Find a language…"))
  })

  it("opens on the chosen row, highlighted, as a select does", () => {
    render(<Language start="fr" />)
    open("Language")
    expect(option("French").getAttribute("aria-selected")).toBe("true")
    expect(option("English").getAttribute("aria-selected")).toBe("false")
  })

  it("ends the chosen row with its check, and says which it is", () => {
    render(<Language />)
    open("Language")
    const english = option("English")
    expect(english.getAttribute("aria-checked")).toBe("true")
    expect(option("French").getAttribute("aria-checked")).toBe("false")
    const check = english.querySelector("[data-menu-check]")!
    expect(check.getAttribute("data-menu-check")).toBe("on")
    expect(english.lastElementChild).toBe(check)
  })

  it("filters by the row's words, and says when nothing matches", () => {
    render(<Language />)
    open("Language")
    fireEvent.change(screen.getByPlaceholderText("Find a language…"), { target: { value: "fren" } })
    expect(screen.queryByRole("option", { name: "English" })).toBeNull()
    expect(option("French")).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText("Find a language…"), { target: { value: "zzz" } })
    expect(screen.getByText("No language by that name.")).toBeTruthy()
  })

  it("hands back the row's own value, as written, and closes", () => {
    const onPick = vi.fn()
    render(<Language onPick={onPick} />)
    open("Language")
    fireEvent.click(option("Yucatec Maya"))
    // cmdk lowercases the value it searches by; the row's own comes back.
    expect(onPick).toHaveBeenCalledWith("MaYa")
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.getByRole("combobox", { name: "Language" }).textContent).toContain("Yucatec Maya")
  })

  it("picks the highlighted row with Enter", () => {
    const onPick = vi.fn()
    render(<Language onPick={onPick} start="" />)
    open("Language")
    const input = screen.getByPlaceholderText("Find a language…")
    fireEvent.change(input, { target: { value: "french" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onPick).toHaveBeenCalledWith("fr")
  })

  it("keeps the menu open for a row that asks to", () => {
    render(
      <Combobox defaultOpen>
        <ComboboxField aria-label="Model" />
        <ComboboxContent>
          <ComboboxInput placeholder="Find a model…" />
          <ComboboxList>
            <ComboboxItem value="refresh" keepOpen onSelect={() => {}}>
              Refresh the list
            </ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    )
    fireEvent.click(option("Refresh the list"))
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("closes on Esc inside a dialog, and the dialog stays", () => {
    const onOpenChange = vi.fn()
    render(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>An outcome by a date.</DialogDescription>
          <Language />
        </DialogContent>
      </Dialog>,
    )
    open("Language")
    expect(screen.getByRole("dialog", { name: "Language" })).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText("Find a language…"), { key: "Escape" })
    expect(screen.queryByRole("dialog", { name: "Language" })).toBeNull()
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe("a combobox of many", () => {
  it("leads each row with its check and stays open while ticking", () => {
    const onChange = vi.fn()
    render(<Projects onChange={onChange} />)
    fireEvent.click(screen.getByRole("button", { name: "Project" }))
    fireEvent.click(option("Launch"))
    expect(onChange).toHaveBeenLastCalledWith(["Launch"])
    const launch = option("Launch")
    expect(launch.getAttribute("aria-checked")).toBe("true")
    expect(launch.firstElementChild?.getAttribute("data-menu-check")).toBe("on")
    fireEvent.click(option("Billing"))
    expect(onChange).toHaveBeenLastCalledWith(["Launch", "Billing"])
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  // Under a finger nothing explains a highlight (DESIGN-BUILD-2, 18 Oct):
  // the priority list opened with Low lit while High was ticked.
  it("opens on its first ticked row, highlighted", () => {
    render(<Projects />)
    fireEvent.click(screen.getByRole("button", { name: "Project" }))
    fireEvent.click(option("Billing"))
    fireEvent.keyDown(screen.getByPlaceholderText("Project"), { key: "Escape" })
    fireEvent.click(screen.getByRole("button", { name: /^Project/ }))
    expect(option("Billing").getAttribute("aria-selected")).toBe("true")
    expect(option("Launch").getAttribute("aria-selected")).toBe("false")
  })

  it("keeps its trigger's own role and name: a chip is a button", () => {
    render(<Projects />)
    const chip = screen.getByRole("button", { name: "Project" })
    expect(chip.getAttribute("aria-expanded")).toBe("false")
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog")
  })
})

// A tablet's finger: a coarse pointer on a screen that keeps popovers (a phone's menu is a sheet: comboboxSheet.test).
describe("a combobox under a finger", () => {
  const pointer = (coarse: boolean) => {
    const was = window.matchMedia
    window.matchMedia = ((query: string) => ({ matches: coarse && query === "(pointer: coarse)", media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    return () => {
      window.matchMedia = was
    }
  }

  it("raises no keyboard over the list: the menu takes the focus, and the filter waits to be tapped", () => {
    const restore = pointer(true)
    try {
      render(<Language />)
      open("Language")
      const menu = screen.getByRole("dialog", { name: "Language" })
      expect(document.activeElement).not.toBe(screen.getByPlaceholderText("Find a language…"))
      expect(menu.contains(document.activeElement)).toBe(true)
    } finally {
      restore()
    }
  })

  it("puts the caret in the filter with a mouse", () => {
    const restore = pointer(false)
    try {
      render(<Language />)
      open("Language")
      expect(document.activeElement).toBe(screen.getByPlaceholderText("Find a language…"))
    } finally {
      restore()
    }
  })

  it("has a filter a finger's height, in type iOS doesn't zoom into", () => {
    render(<Language />)
    open("Language")
    const input = screen.getByPlaceholderText("Find a language…")
    expect(classes(input.parentElement!)).toEqual(expect.arrayContaining(["h-11", "md:h-8"]))
    expect(classes(input)).toEqual(expect.arrayContaining(["text-base", "md:text-sm"]))
  })
})

describe("a combobox's width", () => {
  it("is a field's width where that is wider, and 256px from a chip", () => {
    render(<Language />)
    open("Language")
    expect(screen.getByRole("dialog", { name: "Language" }).className).toContain("min-w-[var(--radix-popover-trigger-width)]")
    cleanup()
    render(<Projects />)
    fireEvent.click(screen.getByRole("button", { name: "Project" }))
    const menu = screen.getByRole("dialog")
    expect(menu.className).not.toContain("min-w-[var(--radix-popover-trigger-width)]")
    expect(menu.className.split(/\s+/)).toContain("w-64")
  })
})

describe("a combobox row under a finger", () => {
  // A menu item is 44px tall under a finger, where a target reaching past it
  // would take its neighbour's taps (app/phone.css F3); a picker's row too.
  it("is a finger's height", () => {
    const css = readFileSync("app/phone.css", "utf8")
    expect(css).toMatch(/\[cmdk-item\][^{}]*\) \{\s*min-height: var\(--m-hit\);/)
  })
})

describe("a combobox row outside a combobox", () => {
  // A list still drawn on cmdk by hand (app/comboboxGuard.test.ts) shares the
  // row: its check sits at the end, and choosing it only calls back.
  it("draws and picks in a plain command list", () => {
    const onSelect = vi.fn()
    render(
      <Command>
        <CommandList>
          <ComboboxItem value="u1" checked onSelect={onSelect}>
            Maya
          </ComboboxItem>
        </CommandList>
      </Command>,
    )
    const row = option("Maya")
    expect(row.lastElementChild?.getAttribute("data-menu-check")).toBe("on")
    fireEvent.click(row)
    expect(onSelect).toHaveBeenCalledWith("u1")
  })
})

describe("the combobox's open menu", () => {
  it("is a chunk of its own: the field brings neither cmdk nor the menu, which it fetches as it's approached", () => {
    const shell = readFileSync("components/ui/combobox.tsx", "utf8")
    expect(shell).not.toMatch(/from "cmdk"/)
    expect(shell).not.toMatch(/^import (?!type)[^\n]*comboboxMenu/m)
    expect(shell).toMatch(/import\("@\/components\/ui\/comboboxMenu"\)/)
    // A field and a trigger fetch it as the pointer comes near, on a press and on focus.
    expect(shell).toMatch(/onPointerEnter[\s\S]*onPointerDown[\s\S]*onFocus/)
  })

  it("draws nothing for a menu that hasn't opened", () => {
    render(
      <Combobox>
        <ComboboxField aria-label="Owner">Ada</ComboboxField>
        <ComboboxContent label="Owner">
          <ComboboxList>
            <ComboboxItem value="ada">Ada</ComboboxItem>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>,
    )
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByText("Ada", { selector: "[cmdk-item]" })).toBeNull()
  })
})
