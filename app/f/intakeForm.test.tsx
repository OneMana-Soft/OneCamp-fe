import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const getForm = vi.fn()
const sendForm = vi.fn()
vi.mock("@/services/formService", () => ({ getForm: (t: string) => getForm(t), sendForm: (...a: unknown[]) => sendForm(...a) }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null }))
const celebrateTask = vi.fn((_el: Element | null) => 8)
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element | null) => celebrateTask(el) }))

import IntakeForm from "@/app/f/[token]/page"
import { warmBursts } from "@/lib/celebrateSoon"

// The celebrations' bursts are a chunk fetched when the page is idle
// (lib/celebrateSoon): here they are in before anything finishes.
beforeAll(async () => {
  await warmBursts()
})

const form = {
  title: "Website change request",
  description: "Tell us what to change.",
  fields: [
    { id: "what", label: "What should change?", type: "long_text", required: true },
    { id: "email", label: "Your email", type: "email", required: false },
  ],
}

async function open() {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <IntakeForm params={Promise.resolve({ token: "tok" })} />
      </Suspense>,
    )
  })
}

describe("a public intake form (work.md W46)", () => {
  beforeEach(() => {
    getForm.mockReset().mockResolvedValue({ ok: true, data: form })
    sendForm.mockReset().mockResolvedValue({ ok: true, data: {} })
    celebrateTask.mockClear()
  })
  afterEach(() => cleanup())

  it("sits on one sheet card under the form's light", async () => {
    await open()
    expect(document.querySelector("[data-form-band]")).not.toBeNull()
    expect(document.querySelector("[data-form-sheet]")).not.toBeNull()
    expect(screen.getByRole("heading", { name: "Website change request" })).toBeInTheDocument()
  })

  it("says Required in words, only on the questions that are", async () => {
    await open()
    expect(screen.getByText("What should change?").parentElement!.textContent).toContain("Required")
    expect(screen.getByText("Your email").textContent).not.toContain("Required")
    expect(document.body.textContent).not.toContain("*")
  })

  it("thanks the sender with one celebration once it is sent", async () => {
    await open()
    fireEvent.change(screen.getByLabelText(/What should change/), { target: { value: "The pricing page" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "The pricing page" }, "")
    expect(screen.getByRole("heading", { name: "Sent" })).toBeInTheDocument()
    expect(celebrateTask).toHaveBeenCalledTimes(1)
  })

  it("takes a number as typed, in the sender's signs, and says what isn't one before sending", async () => {
    getForm.mockResolvedValue({ ok: true, data: { ...form, fields: [...form.fields, { id: "seats", label: "Seats", type: "number", required: false }] } })
    await open()
    const seats = screen.getByLabelText(/Seats/) as HTMLInputElement
    // Text, not a browser number input, which rewrote "1,5" in its own locale or emptied it.
    expect(seats.type).toBe("text")
    expect(seats.inputMode).toBe("decimal")
    fireEvent.change(screen.getByLabelText(/What should change/), { target: { value: "The pricing page" } })
    fireEvent.change(seats, { target: { value: "12 kg" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("“Seats” needs a number.")
    fireEvent.change(seats, { target: { value: "12" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })))
    expect(sendForm).toHaveBeenCalledWith("tok", { what: "The pricing page", seats: "12" }, "")
  })

  it("says so when the form is gone, as every public link does (PTC-19)", async () => {
    getForm.mockResolvedValue({ ok: false, status: 404, msg: "" })
    await open()
    expect(screen.getByRole("heading", { name: "This form doesn't exist or was deleted" })).toBeInTheDocument()
    expect(document.querySelector("[data-public-gone]")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull()
  })

  it("says a server that didn't answer couldn't load the form, and Try again reads it again", async () => {
    getForm.mockResolvedValueOnce({ ok: false, status: 503, msg: "" })
    await open()
    expect(screen.getByText("Couldn't load this form")).toBeInTheDocument()
    getForm.mockResolvedValueOnce({ ok: true, status: 200, data: form })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /Try again/ })))
    expect(getForm).toHaveBeenCalledTimes(2)
  })
})
