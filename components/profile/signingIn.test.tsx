import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The three ways a person signs in, in their profile. A check that fails says
// so and offers to try again. It used to say "No password yet" to someone who
// has one (and offer to set one), hide two-step verification entirely, or
// leave "Couldn't load your passkeys." with nothing to press.

const { get, getStatus, beginSetup, confirmSetup, disable, listPasskeys } = vi.hoisted(() => ({
  get: vi.fn(),
  getStatus: vi.fn(),
  beginSetup: vi.fn(),
  confirmSetup: vi.fn(),
  disable: vi.fn(),
  listPasskeys: vi.fn(),
}))
vi.mock("@/lib/axiosInstance", () => ({ default: { get }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/services/twoFactorService", () => ({ default: { getStatus, beginSetup, confirmSetup, disable } }))
vi.mock("@/services/passkeyService", () => ({ listPasskeys, addPasskey: vi.fn(), removePasskey: vi.fn(), renamePasskey: vi.fn() }))
vi.mock("@/lib/auth/webauthn", () => ({ passkeysSupported: () => true, passkeyErrorMessage: () => null }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/services/auth/AuthService", () => ({ default: { changePassword: vi.fn() } }))

import { ChangePasswordSection } from "./ChangePasswordSection"
import { TwoFactorSection } from "./TwoFactorSection"
import { PasskeySection } from "./PasskeySection"

beforeEach(() => {
  get.mockReset()
  getStatus.mockReset()
  beginSetup.mockReset()
  confirmSetup.mockReset()
  disable.mockReset()
  listPasskeys.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("the password row", () => {
  it("says the check failed rather than that there is no password, and tries again", async () => {
    get.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce({ data: { has_password: true } })
    render(<ChangePasswordSection />)
    expect(await screen.findByText("Couldn't check your password")).toBeInTheDocument()
    expect(screen.queryByText("No password yet")).toBeNull()
    expect(screen.queryByRole("button", { name: "Set a password" })).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(await screen.findByRole("button", { name: "Change password" })).toBeInTheDocument()
  })

  it("asks the server through the app's own client, quietly for the global toast", async () => {
    get.mockResolvedValue({ data: { has_password: false } })
    render(<ChangePasswordSection />)
    expect(await screen.findByRole("button", { name: "Set a password" })).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith("/auth/has-password", { suppressErrorToast: true })
  })

  it("holds its row while it checks", () => {
    get.mockReturnValue(new Promise(() => {}))
    render(<ChangePasswordSection />)
    expect(screen.getByRole("status", { name: "Checking your password" })).toBeInTheDocument()
  })
})

describe("the two-step verification row", () => {
  it("says it couldn't check, without claiming it is off, and tries again", async () => {
    getStatus
      .mockResolvedValueOnce({ ok: false, msg: "Could not read your two-factor status.", code: "" })
      .mockResolvedValueOnce({ ok: true, data: { enrolled: true, pendingEnrolment: false, unusedRecoveryCodes: 8 } })
    render(<TwoFactorSection />)
    expect(await screen.findByText("Couldn't check two-step verification")).toBeInTheDocument()
    expect(screen.queryByText(/^Off\./)).toBeNull()
    expect(screen.queryByRole("button", { name: "Turn on" })).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(await screen.findByRole("button", { name: "Turn off" })).toBeInTheDocument()
  })

  it("holds its row while it checks", () => {
    getStatus.mockReturnValue(new Promise(() => {}))
    render(<TwoFactorSection />)
    expect(screen.getByRole("status", { name: "Checking two-step verification" })).toBeInTheDocument()
  })
})

describe("the passkeys row", () => {
  it("offers to try again when the list couldn't load", async () => {
    listPasskeys.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce([
      { id: "k1", name: "Passkey on Mac", created_at: "2026-10-01T10:00:00Z", last_used_at: null },
    ])
    render(<PasskeySection />)
    expect(await screen.findByText(/Couldn't load your passkeys/)).toBeInTheDocument()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    expect(await screen.findByText("Passkey on Mac")).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't load your passkeys/)).toBeNull()
  })
})

// After a wrong code the cursor is in the field, so the next code is typed
// straight in. The field used to be disabled while a code was checked: a
// browser doesn't focus a disabled field, and drops the focus of one that
// becomes disabled, so the next code went nowhere until the person clicked
// back in. jsdom lets a disabled field take focus, so the tests record whether
// the field was disabled whenever it was focused.
describe("a two-step code that is refused", () => {
  const watchFocus = () => {
    const disabledWhenFocused: boolean[] = []
    const focus = HTMLInputElement.prototype.focus
    vi.spyOn(HTMLInputElement.prototype, "focus").mockImplementation(function (this: HTMLInputElement, options?: FocusOptions) {
      disabledWhenFocused.push(this.disabled)
      focus.call(this, options)
    })
    return disabledWhenFocused
  }

  it("leaves the cursor in the field when turning it on", async () => {
    getStatus.mockResolvedValue({ ok: true, data: { enrolled: false, pendingEnrolment: false, unusedRecoveryCodes: 0 } })
    beginSetup.mockResolvedValue({ ok: true, data: { secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/OneCamp:sam?secret=JBSWY3DPEHPK3PXP" } })
    let answer: (v: unknown) => void = () => {}
    confirmSetup.mockReturnValue(new Promise((r) => (answer = r)))
    const disabledWhenFocused = watchFocus()
    render(<TwoFactorSection />)
    const turnOn = await screen.findByRole("button", { name: "Turn on" })
    await act(async () => void fireEvent.click(turnOn))
    const field = screen.getByLabelText("Enter the 6-digit code to finish") as HTMLInputElement

    fireEvent.change(field, { target: { value: "123456" } })
    // While the code is checked the field can't be changed, but it isn't disabled.
    expect(field.disabled).toBe(false)
    expect(field).toHaveAttribute("aria-busy", "true")

    await act(async () => answer({ ok: false, msg: "That code didn't work. Try the newest one.", code: "" }))
    expect(field.value).toBe("")
    expect(document.activeElement).toBe(field)
    expect(disabledWhenFocused).not.toContain(true)
  })

  it("brings the cursor back to the field when turning it off", async () => {
    getStatus.mockResolvedValue({ ok: true, data: { enrolled: true, pendingEnrolment: false, unusedRecoveryCodes: 8 } })
    disable.mockResolvedValue({ ok: false, msg: "That code didn't work. Try the newest one.", code: "" })
    const disabledWhenFocused = watchFocus()
    render(<TwoFactorSection />)
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }))
    const field = screen.getByLabelText("6-digit code") as HTMLInputElement
    fireEvent.change(field, { target: { value: "123456" } })
    const submit = screen.getByRole("button", { name: "Turn off two-step verification" })
    submit.focus()
    await act(async () => void fireEvent.click(submit))

    expect(document.activeElement).toBe(field)
    expect(disabledWhenFocused).not.toContain(true)
  })
})
