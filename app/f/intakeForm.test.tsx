import { Suspense } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getForm = vi.fn()
const sendForm = vi.fn()
vi.mock("@/services/formService", () => ({ getForm: (t: string) => getForm(t), sendForm: (...a: unknown[]) => sendForm(...a) }))
vi.mock("@/components/public/MadeWithOneCamp", () => ({ MadeWithOneCamp: () => null }))
const celebrateTask = vi.fn((_el: Element | null) => 8)
vi.mock("@/lib/celebrate", () => ({ celebrateTask: (el: Element | null) => celebrateTask(el) }))

import IntakeForm from "@/app/f/[token]/page"

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

  it("says so when the form is gone", async () => {
    getForm.mockResolvedValue({ ok: false, status: 404, msg: "" })
    await open()
    expect(screen.getByText("This form isn't available")).toBeInTheDocument()
  })
})
