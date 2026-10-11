import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ConfirmAlertDialog, confirmIconFor } from "@/components/dialog/confirmAlertDialog"
import { CircleHelp, LogOut, Power, Trash2, UserMinus } from "@/lib/icons"

afterEach(cleanup)

/**
 * The confirm (design v3, admin §8 H3). A question that can lose something
 * must make the safe answer the easy one: focus starts on Cancel when the
 * action destroys, and on the action only when it doesn't. The action that
 * destroys is the one solid danger button in the app. And a confirm whose
 * action talks to the server stays open until the server answers, with the
 * failure said inside the dialog, where the person is looking, not in a
 * toast that disappears.
 */
describe("the confirm dialog", () => {
  it("focuses Cancel on a destructive confirm", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Delete #design?" description="Its messages go too." confirmText="Delete channel" destructive />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }))
  })

  it("focuses the action on a safe one", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Publish the update?" description="Everyone sees it." confirmText="Publish" />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Publish" }))
  })

  it("draws a destructive action danger-solid, with a danger tile", () => {
    const { baseElement } = render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Deactivate Marcus Webb?" description="He can't sign in." confirmText="Deactivate" destructive />)
    expect(screen.getByRole("button", { name: "Deactivate" }).className).toMatch(/\bbtn-danger-solid\b/)
    expect(baseElement.querySelector('[data-confirm-tile="danger"]')).not.toBeNull()
  })

  it("sits at the small width, r16 and e4, and keeps its footer off the sunken strip", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Archive the project?" description="It leaves the sidebar." confirmText="Archive project" />)
    const dialog = screen.getByRole("alertdialog")
    expect(dialog.className).toMatch(/max-w-\[400px\]/)
    expect(dialog.className).toMatch(/rounded-\[16px\]/)
    expect(dialog.className).toMatch(/\bshadow-e4\b/)
    expect(dialog.className).not.toMatch(/(^|\s)border(\s|$)/)
    const footer = screen.getByRole("button", { name: "Cancel" }).parentElement!
    expect(footer.className).not.toMatch(/bg-sunken|v3-dlg-footer/)
  })

  it("closes at once when the action returns nothing, as it always has", () => {
    const onOpenChange = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmAlertDialog open onOpenChange={onOpenChange} title="Leave without saving?" description="Your changes go." confirmText="Leave without saving" destructive onConfirm={onConfirm} />)
    fireEvent.click(screen.getByRole("button", { name: "Leave without saving" }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("stays open and busy while the server answers, then closes", async () => {
    let finish: () => void = () => {}
    const onOpenChange = vi.fn()
    render(<ConfirmAlertDialog open onOpenChange={onOpenChange} title="Revoke this token?" description="Scripts using it stop." confirmText="Revoke token" destructive onConfirm={() => new Promise<void>((r) => (finish = r))} />)
    const action = screen.getByRole("button", { name: "Revoke token" })
    await act(async () => fireEvent.click(action))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(action).toHaveAttribute("aria-busy", "true")
    // The label stays (transparent) so the button keeps its width.
    expect(action.textContent).toContain("Revoke token")
    // Escape doesn't close it mid-request.
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("shows the server's reason inside the dialog when the action fails, and stays open", async () => {
    const onOpenChange = vi.fn()
    render(<ConfirmAlertDialog open onOpenChange={onOpenChange} title="Delete webhook?" description="Deliveries stop." confirmText="Delete webhook" destructive onConfirm={() => Promise.reject({ response: { data: { msg: "The webhook is in use by a workflow." } } })} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete webhook" })))
    const alert = screen.getByRole("alert")
    expect(alert).toHaveTextContent("The webhook is in use by a workflow.")
    expect(screen.getByRole("alertdialog")).toContainElement(alert)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Delete webhook" })).not.toHaveAttribute("aria-busy")
  })

  it("defaults the button to Confirm, never Continue", () => {
    render(<ConfirmAlertDialog open onOpenChange={() => {}} title="Send the invoice?" description="The client gets an email." />)
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull()
  })
})

describe("the tile's default glyph", () => {
  it("reads it from what the confirm does", () => {
    expect(confirmIconFor({ title: "Stop Release Captain?", confirmText: "Stop agent", destructive: true })).toBe(Power)
    expect(confirmIconFor({ title: "Deactivate Marcus Webb?", confirmText: "Deactivate", destructive: true })).toBe(UserMinus)
    expect(confirmIconFor({ title: "Remove Ada from the team?", confirmText: "Remove member", destructive: true })).toBe(UserMinus)
    expect(confirmIconFor({ title: "Leave without saving?", confirmText: "Leave without saving", destructive: true })).toBe(LogOut)
    expect(confirmIconFor({ title: "Delete #design?", confirmText: "Delete channel", destructive: true })).toBe(Trash2)
    expect(confirmIconFor({ title: "Publish?", confirmText: "Go ahead" })).toBe(CircleHelp)
  })
})
