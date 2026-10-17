import { act, fireEvent, screen } from "@testing-library/react"
import { expect } from "vitest"
import { secretReentryHint } from "@/lib/utils/secretDestination"

/**
 * A settings form that keeps a secret beside an address, as a test drives it.
 * Every such form asks for the secret again once the address moves
 * (hooks/useSecretReentry): the field turns required with "Enter the … again
 * for the new address." under it, and Save stops there with the cursor in it.
 * The hook has its own test, but a form that dropped its
 * `if (!reentry.check()) return` would still save everything else, the server
 * would refuse the secret, and nothing the form's own tests check would fail.
 */
export interface SecretReentryForm {
  /** The address field, holding the address the secret is stored for. */
  address: () => HTMLElement
  /** What the address becomes: one the secret wasn't given for. */
  moveTo: string
  /** The secret's field. */
  secret: () => HTMLElement
  /** The secret as the form names it ("API key", "runner token", "password"). */
  noun: string
  /** Presses the form's Save; a promise it returns is awaited. */
  save: () => unknown
  /** How many save requests the form has sent. */
  sent: () => number
}

/** Moves the address and saves: the form asks for the secret again and sends nothing. */
export async function expectSecretAskedAgain(form: SecretReentryForm): Promise<void> {
  const before = form.sent()
  expect(form.secret().hasAttribute("required"), "the secret is optional while the address stands").toBe(false)

  fireEvent.change(form.address(), { target: { value: form.moveTo } })
  expect(form.secret().hasAttribute("required"), "the secret is required for the new address").toBe(true)
  expect(screen.getByText(secretReentryHint(form.noun))).toBeTruthy()

  await act(async () => {
    await form.save()
  })
  expect(form.sent(), "Save sent nothing").toBe(before)
  expect(document.activeElement, "the cursor is in the secret's field").toBe(form.secret())
  expect(form.secret().getAttribute("aria-invalid")).toBe("true")
}
