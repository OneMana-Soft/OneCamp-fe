import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The three ways a person signs in, in their profile. A check that fails says
// so and offers to try again. It used to say "No password yet" to someone who
// has one (and offer to set one), hide two-step verification entirely, or
// leave "Couldn't load your passkeys." with nothing to press.

const { get, getStatus, listPasskeys } = vi.hoisted(() => ({ get: vi.fn(), getStatus: vi.fn(), listPasskeys: vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get }, OWN_ERRORS: { suppressErrorToast: true } }))
vi.mock("@/services/twoFactorService", () => ({ default: { getStatus } }))
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
  listPasskeys.mockReset()
})
afterEach(cleanup)

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
