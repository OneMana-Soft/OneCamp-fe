import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { useState } from "react"
import {
  DangerZone,
  SettingRow,
  SettingsCardError,
  SettingsCardFooter,
  SettingsList,
  SwitchRow,
} from "@/components/ui/settingsSection"
import { useSaveStatus } from "@/components/ui/saveStatus"
import { TooltipProvider } from "@/components/ui/tooltip"

vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))

// Design v3, admin §1.3: the settings card. Rows are 56px at least with the
// control in one column; a batched card always has its footer; an instant
// save says "Saved" beside the label and to a screen reader, and a failed one
// puts the control back with the reason.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const css = readFileSync(join(process.cwd(), "app/styles/admin/core.css"), "utf8")
const rule = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf("}", css.indexOf(`${sel} {`)))

describe("the settings card", () => {
  it("is the raised surface at e1, r12, with rows of 56px between inset hairlines", () => {
    expect(rule(".set-card")).toMatch(/box-shadow:\s*var\(--e1\)/)
    expect(rule(".set-row")).toMatch(/min-height:\s*56px/)
    expect(rule(".set-row")).toMatch(/padding:\s*14px 16px/)
    expect(css).toMatch(/\.set-card > \.set-row \+ \.set-row::before[\s\S]*?left:\s*16px/)
  })

  it("rings a dirty card in the accent and a danger zone in danger, never with a fill", () => {
    expect(css).toMatch(/\.set-card\[data-dirty="true"\][\s\S]*?var\(--brand\) 35%/)
    render(<DangerZone><SwitchRow label="Turn off push" checked={false} onChange={() => {}} /></DangerZone>)
    expect(screen.getByRole("heading", { name: "Danger zone" }).className).toContain("text-danger-ink")
    const card = document.querySelector("[data-settings-card]") as HTMLElement
    expect(card.getAttribute("data-danger")).toBe("true")
    expect(card.className).not.toMatch(/bg-(destructive|danger)/)
  })

  it("puts a field in the 240px control column, so one card's fields line up", () => {
    render(
      <SettingsList>
        <SettingRow label="Upload limit" controlId="u" control="field"><input id="u" /></SettingRow>
        <SettingRow label="Sender" controlId="s" control="field"><input id="s" /></SettingRow>
      </SettingsList>,
    )
    for (const id of ["u", "s"]) {
      const col = document.getElementById(id)!.parentElement as HTMLElement
      expect(col.getAttribute("data-control")).toBe("field")
      expect(col.className).toContain("@min-[520px]:w-60")
    }
  })

  it("always draws a batched card's footer, with Save off until something changed", () => {
    const save = vi.fn()
    const { rerender } = render(<SettingsList footer={<SettingsCardFooter hint="Applies at once, no restart." dirty={false} onSave={save} onReset={() => {}} />}>rows</SettingsList>)
    expect(screen.getByText("Applies at once, no restart.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull()
    rerender(<SettingsList dirty footer={<SettingsCardFooter hint="Applies at once, no restart." dirty onSave={save} onReset={() => {}} />}>rows</SettingsList>)
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(save).toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy()
    expect(document.querySelector("[data-settings-card]")?.getAttribute("data-dirty")).toBe("true")
  })

  it("says Saved beside the label, and to a screen reader, when an instant save lands", async () => {
    function Row() {
      const [on, setOn] = useState(false)
      const { status, run } = useSaveStatus()
      return (
        <SwitchRow
          label="Read receipts"
          checked={on}
          status={status}
          onChange={(v) => {
            setOn(v)
            void run(() => Promise.resolve())
          }}
        />
      )
    }
    render(<Row />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    expect(document.querySelector("[data-saved-tick]")?.textContent).toContain("Saved")
    expect(screen.getByRole("status").textContent).toBe("Saved")
  })

  it("puts the switch back, shows the server's reason and shakes the row when a save fails", async () => {
    function Row() {
      const [on, setOn] = useState(false)
      const { status, run } = useSaveStatus()
      return (
        <SwitchRow
          label="Read receipts"
          description="When off, nobody sees who read their messages."
          checked={on}
          status={status}
          onChange={async (v) => {
            setOn(v)
            if (!(await run(() => Promise.reject({ response: { data: { msg: "Only admins can change this." } } })))) setOn(!v)
          }}
        />
      )
    }
    render(<Row />)
    await act(async () => {
      fireEvent.click(screen.getByRole("switch"))
    })
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false")
    expect(screen.getByText("Only admins can change this.")).toBeTruthy()
    expect(document.querySelector("[data-save-failed]")).toBeTruthy()
  })

  it("toggles a switch row from anywhere on the row, and not when it is locked", () => {
    const change = vi.fn()
    const { container, rerender } = render(<SwitchRow label="Guests" checked={false} onChange={change} />, { wrapper: TooltipProvider })
    fireEvent.click(container.firstElementChild as HTMLElement)
    expect(change).toHaveBeenCalledWith(true)
    change.mockClear()
    rerender(<SwitchRow label="Guests" checked={false} onChange={change} locked="Needs a OneCamp licence" />)
    fireEvent.click(container.firstElementChild as HTMLElement)
    expect(change).not.toHaveBeenCalled()
    expect(screen.getByLabelText("Needs a OneCamp licence")).toBeTruthy()
  })

  it("replaces a card's body with one error row and Try again when its read fails", () => {
    const retry = vi.fn()
    render(<SettingsList><SettingsCardError what="workspace settings" reason="The server is restarting." onRetry={retry} /></SettingsList>)
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load workspace settings.")
    expect(screen.getByText("The server is restarting.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }))
    expect(retry).toHaveBeenCalled()
  })
})
