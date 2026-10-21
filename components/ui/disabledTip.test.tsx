import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { Button } from "./button"
import { TaskCheck } from "@/components/task/TaskCheck"

// A disabled control's reason is the app's tooltip, portalled to the page
// (components/ui/disabledTip.tsx), so no clip around the control cuts it. It
// was a CSS ::after; e2e/disabledTip.spec.ts measures it whole in a browser.

vi.mock("@/lib/celebrateSoon", () => ({ celebrateTask: vi.fn(), warmBurstsWhenIdle: () => undefined }))
vi.mock("@/components/task/taskStatusCell", () => ({ statusKindOf: () => "todo", useStatusLabel: () => "Todo" }))

afterEach(cleanup)

const chip = () => document.body.querySelector("[data-radix-popper-content-wrapper]")

describe("a disabled control's reason", () => {
  it("opens with focus as a tooltip drawn at the page's end, and the button names it", async () => {
    const press = vi.fn()
    const { container } = render(
      <div style={{ overflow: "hidden" }}>
        <Button disabled disabledReason="Pick a project first" aria-label="Attach a file" onClick={press} />
      </div>,
    )
    const button = screen.getByRole("button", { name: "Attach a file" })
    expect(button.getAttribute("aria-disabled")).toBe("true")
    expect((button as HTMLButtonElement).disabled).toBe(false)
    // Its chunk comes, and the button is the trigger.
    await waitFor(() => expect(screen.getByRole("button", { name: "Attach a file" }).getAttribute("data-state")).toBe("closed"))
    const trigger = screen.getByRole("button", { name: "Attach a file" })
    act(() => trigger.focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("Pick a project first"))
    expect(container.contains(chip())).toBe(false)
    expect(trigger.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    fireEvent.click(trigger)
    expect(press).not.toHaveBeenCalled()
  })

  it("isn't there for an enabled button, or a disabled one with no reason", () => {
    render(
      <>
        <Button disabledReason="Never shown">Go</Button>
        <Button disabled>Stop</Button>
      </>,
    )
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("data-disabled-reason")).toBeNull()
    expect(screen.getByRole("button", { name: "Go" }).getAttribute("data-state")).toBeNull()
    expect((screen.getByRole("button", { name: "Stop" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("is TaskCheck's too, and its CSS tip says nothing while disabled", async () => {
    render(<TaskCheck done={false} status={{ name: "todo" } as never} taskName="Draft" onToggle={() => {}} disabled />)
    const check = screen.getByRole("button", { name: "Mark Draft complete" })
    expect(check.getAttribute("data-tip")).toBe("")
    await waitFor(() => expect(screen.getByRole("button", { name: "Mark Draft complete" }).getAttribute("data-state")).toBe("closed"))
    act(() => screen.getByRole("button", { name: "Mark Draft complete" }).focus())
    await waitFor(() => expect(screen.getByRole("tooltip").textContent).toBe("Only this project's members can change it"))
  })
})
