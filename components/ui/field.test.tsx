import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

afterEach(cleanup)

// Field exists so a help line and an error are read out with the control they
// belong to. These pin the wiring a sighted reviewer cannot see.
describe("Field", () => {
  it("labels the control and describes it with its help", () => {
    render(
      <Field label="Project name" help="Shown in the sidebar.">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText("Project name")
    expect(input.getAttribute("aria-describedby")).toBe(input.id + "-help")
    expect(screen.getByText("Shown in the sidebar.").id).toBe(input.id + "-help")
    expect(input.getAttribute("aria-invalid")).toBeNull()
  })

  it("marks the control invalid and points at the error while there is one", () => {
    render(
      <Field label="Email" help="Receipts go here." error="Enter a full address.">
        <Input id="email" aria-describedby="extra" />
      </Field>,
    )
    const input = screen.getByLabelText("Email")
    expect(input.id).toBe("email")
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.getAttribute("aria-describedby")).toBe("extra email-help email-error")
    const error = screen.getByText("Enter a full address.")
    expect(error.id).toBe("email-error")
    expect(error.getAttribute("aria-live")).toBe("polite")
  })

  it("keeps the live region mounted with no error, so the first error is announced", () => {
    const { container } = render(
      <Field label="Name">
        <Input />
      </Field>,
    )
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy()
  })
})
