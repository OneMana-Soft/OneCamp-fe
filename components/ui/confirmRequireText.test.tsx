import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { ConfirmAlertDialog, requireTextMatches } from "@/components/dialog/confirmAlertDialog"

afterEach(cleanup)

/**
 * Type-to-confirm (design v3, admin §8 H4). An action that destroys data or
 * access for many people (stop all agents, roll back an import, remove the
 * SSO provider) asks for the thing's name typed out, so a reflex click on a
 * red button can't do it. The match is exact, because the point is to read
 * the name: case counts, only the spaces at the ends don't.
 */
function open(onConfirm = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <ConfirmAlertDialog
      open
      onOpenChange={onOpenChange}
      title="Stop all agents?"
      description="Every agent in Kestrel Studio stops now."
      confirmText="Stop all agents"
      destructive
      requireText="Kestrel Studio"
      onConfirm={onConfirm}
    />,
  )
  return { onConfirm, onOpenChange, field: screen.getByLabelText(/Type\s+Kestrel Studio\s+to confirm/), action: screen.getByRole("button", { name: "Stop all agents" }) }
}

describe("type to confirm", () => {
  it("matches case-sensitively, ignoring spaces at the ends", () => {
    expect(requireTextMatches("Kestrel Studio", "Kestrel Studio")).toBe(true)
    expect(requireTextMatches("  Kestrel Studio ", "Kestrel Studio")).toBe(true)
    expect(requireTextMatches("kestrel studio", "Kestrel Studio")).toBe(false)
    expect(requireTextMatches("Kestrel", "Kestrel Studio")).toBe(false)
  })

  it("shows the phrase in mono and keeps the action disabled until it is typed", () => {
    const { field, action } = open()
    expect(screen.getByText("Kestrel Studio", { selector: "code" }).className).toMatch(/\bfont-mono\b/)
    expect(action).toBeDisabled()
    fireEvent.change(field, { target: { value: "kestrel studio" } })
    expect(action).toBeDisabled()
    expect(document.querySelector("[data-require-match]")).toBeNull()
    fireEvent.change(field, { target: { value: " Kestrel Studio " } })
    expect(action).toBeEnabled()
    expect(document.querySelector("[data-require-match]")).not.toBeNull()
  })

  it("shakes the field on Enter while it doesn't match, and confirms on Enter once it does", () => {
    vi.useFakeTimers()
    const { field, onConfirm } = open()
    fireEvent.change(field, { target: { value: "Kestrel" } })
    fireEvent.keyDown(field, { key: "Enter" })
    act(() => { vi.advanceTimersByTime(20) })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(field.parentElement).toHaveAttribute("data-shake", "true")
    fireEvent.change(field, { target: { value: "Kestrel Studio" } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(onConfirm).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it("is carried from useConfirm to the dialog", () => {
    const hook = readFileSync(resolve(__dirname, "../../hooks/useConfirm.ts"), "utf8")
    expect(hook).toMatch(/requireText: opts\.requireText/)
    const manager = readFileSync(resolve(__dirname, "UnifiedUIManager.tsx"), "utf8")
    expect(manager).toMatch(/requireText=\{ui\.confirmAlert\.data\.requireText\}/)
  })
})
