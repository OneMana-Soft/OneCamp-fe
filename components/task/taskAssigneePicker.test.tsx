import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import type { UserProfileDataInterface } from "@/types/user"

vi.mock("@/components/navigationBar/desktop/desktopNavigationChatAvatar", () => ({ DesktopNavigationChatAvatar: () => <span data-face="" /> }))
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined }) }))
vi.mock("@/components/ui/botTag", () => ({ BotTag: () => null }))

const { TaskAssigneePicker } = await import("./taskAssigneePicker")

afterEach(cleanup)

const person = (id: string, name: string) => ({ user_uuid: id, user_name: name, user_full_name: name }) as unknown as UserProfileDataInterface
const MAYA = person("u1", "Maya Chen")
const ARJUN = person("u2", "Arjun Rao")

// The panel's assignee took someone off only when they were chosen again,
// which nobody would find (DESIGN-BUILD-2, 18 Oct): "No one" leads the list
// now, as BulkTaskBar's has it, checked while no one is assigned.
describe("the task's assignee picker", () => {
  const open = () => fireEvent.click(screen.getByRole("combobox", { name: /^Assignee:/ }))

  it("leads with No one, checked while nobody is assigned", () => {
    render(<TaskAssigneePicker isAdmin label="Assignee" members={[MAYA, ARJUN]} onChange={() => {}} />)
    open()
    const rows = screen.getAllByRole("option")
    expect(rows[0].textContent).toContain("No one")
    expect(rows[0].getAttribute("aria-checked")).toBe("true")
  })

  it("takes the assignee off with No one, and keeps them when they are chosen again", () => {
    const onChange = vi.fn()
    render(<TaskAssigneePicker isAdmin label="Assignee" members={[MAYA, ARJUN]} assignee={MAYA} onChange={onChange} />)
    open()
    expect(screen.getByRole("option", { name: /No one/ }).getAttribute("aria-checked")).toBe("false")
    fireEvent.click(screen.getByRole("option", { name: /Maya Chen/ }))
    expect(onChange).not.toHaveBeenCalled()
    open()
    fireEvent.click(screen.getByRole("option", { name: /No one/ }))
    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it("assigns the one chosen", () => {
    const onChange = vi.fn()
    render(<TaskAssigneePicker isAdmin label="Assignee" members={[MAYA, ARJUN]} assignee={MAYA} onChange={onChange} />)
    open()
    fireEvent.click(screen.getByRole("option", { name: /Arjun Rao/ }))
    expect(onChange).toHaveBeenCalledWith(ARJUN)
  })
})

// DESIGN-BUILD-11 S1 and DESIGN-BUILD-13: someone who can't change the
// assignee saw it as a disabled control, which the interaction layer draws at
// half strength (2.24:1); and everyone saw the name a step lighter than every
// other value.
describe("the Assignee property", () => {
  it("reads as text to someone who can't change it, not a disabled control", () => {
    render(<TaskAssigneePicker isAdmin={false} label="Assignee" members={[MAYA]} assignee={MAYA} onChange={() => {}} />)
    expect(screen.queryByRole("combobox")).toBeNull()
    expect(screen.getByText("Maya Chen").closest("button, [data-interactive], [aria-disabled]")).toBeNull()
  })

  it("is a picker for someone who can change it, in the values' ink", () => {
    render(<TaskAssigneePicker isAdmin label="Assignee" members={[MAYA]} assignee={MAYA} onChange={() => {}} />)
    const picker = screen.getByRole("combobox", { name: "Assignee: Maya Chen" })
    expect(picker.hasAttribute("disabled")).toBe(false)
    expect(picker.className.split(" ")).toContain("text-foreground")
    expect(picker.className.split(" ")).not.toContain("text-muted-foreground")
  })
})
