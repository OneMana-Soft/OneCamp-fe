import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

import { TwoFactorPrompt } from "@/components/auth/TwoFactorPrompt"

// The second step of a sign-in. A wrong code is cleared and the cursor goes back
// into the field for the next one: the field was disabled while the code was
// checked, and focusing a disabled field does nothing, so the next code typed
// went nowhere. Verify can be pressed at once and says what is missing.

afterEach(cleanup)

const field = () => screen.getByLabelText("6-digit code") as HTMLInputElement

describe("the two-step code", () => {
  it("leaves the cursor in the field after a wrong code", async () => {
    // jsdom lets a disabled field take focus; a browser does not. So record
    // whether the field was disabled at the moment it was focused.
    const disabledWhenFocused: boolean[] = []
    const focus = HTMLInputElement.prototype.focus
    vi.spyOn(HTMLInputElement.prototype, "focus").mockImplementation(function (this: HTMLInputElement, options?: FocusOptions) {
      disabledWhenFocused.push(this.disabled)
      return focus.call(this, options)
    })
    const onSubmit = vi.fn(async () => ({ msg: "That code didn't work. Check it and try again.", expired: false }))
    render(<TwoFactorPrompt onSubmit={onSubmit} onCancel={() => {}} />)
    await act(async () => void fireEvent.change(field(), { target: { value: "123456" } }))
    expect(onSubmit).toHaveBeenCalledWith("123456")
    expect(await screen.findByText("That code didn't work. Check it and try again.")).toBeTruthy()
    expect(field().value).toBe("")
    expect(field().disabled).toBe(false)
    expect(document.activeElement).toBe(field())
    expect(disabledWhenFocused.length).toBeGreaterThan(1)
    expect(disabledWhenFocused).not.toContain(true)
    vi.restoreAllMocks()
  })

  it("can't be changed while a code is being checked", async () => {
    let finish: (v: null) => void = () => {}
    const onSubmit = vi.fn(() => new Promise<null>((resolve) => (finish = resolve)))
    render(<TwoFactorPrompt onSubmit={onSubmit} onCancel={() => {}} />)
    await act(async () => void fireEvent.change(field(), { target: { value: "123456" } }))
    expect(field().readOnly).toBe(true)
    expect(field().getAttribute("aria-busy")).toBe("true")
    await act(async () => finish(null))
  })

  it("lets Verify be pressed before a code is typed, and says what is missing", async () => {
    const onSubmit = vi.fn(async () => null)
    render(<TwoFactorPrompt onSubmit={onSubmit} onCancel={() => {}} />)
    const verify = screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement
    expect(verify.disabled).toBe(false)
    await act(async () => void fireEvent.click(verify))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Enter the 6-digit code from your authenticator app.")
    expect(document.activeElement).toBe(field())
  })

  it("asks for a recovery code by that name", async () => {
    render(<TwoFactorPrompt onSubmit={vi.fn(async () => null)} onCancel={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Use a recovery code" }))
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Verify" })))
    expect(screen.getByRole("alert").textContent).toBe("Enter one of your recovery codes.")
  })

  it("is as tall as the page's other fields and buttons", () => {
    render(<TwoFactorPrompt onSubmit={vi.fn(async () => null)} onCancel={() => {}} />)
    expect(field().className).toContain("md:h-10")
  })
})
