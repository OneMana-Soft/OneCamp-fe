import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ProjectRolePicker, roleOf } from "@/components/member/ProjectRolePicker"

afterEach(cleanup)

const ben = { user_uuid: "u-ben", user_name: "ben", user_full_name: "Ben", user_profile_object_key: "" }

function openMenu(name: RegExp) {
  const trigger = screen.getByRole("button", { name })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" })
  fireEvent.keyDown(trigger, { key: "Enter" })
}

describe("a project member's role", () => {
  it("is the list's role, or the admin flag's for an older server", () => {
    expect(roleOf({ user_project_role: "viewer", user_is_admin: false })).toBe("viewer")
    expect(roleOf({ user_is_admin: true })).toBe("admin")
    expect(roleOf({})).toBe("member")
  })

  it("is a word for someone who doesn't manage the project's people", () => {
    render(<ProjectRolePicker member={{ ...ben, user_project_role: "commenter" }} canChange={false} onChoose={() => {}} />)
    expect(screen.getByText("Commenter")).toBeTruthy()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("stays Admin for the project's creator", () => {
    render(<ProjectRolePicker member={{ ...ben, user_project_role: "admin" }} canChange isCreator onChoose={() => {}} />)
    expect(screen.getByText("Admin").getAttribute("title")).toBe("The project's creator stays one of its admins.")
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is picked from the four, each saying what it does", () => {
    const onChoose = vi.fn()
    render(<ProjectRolePicker member={{ ...ben, user_project_role: "member" }} canChange onChoose={onChoose} />)
    openMenu(/ben's role: Member/)
    const items = screen.getAllByRole("menuitemradio")
    expect(items.map((i) => i.textContent)).toEqual([
      "AdminRuns the project: its settings and its people.",
      "MemberMakes tasks and works on them.",
      "CommenterReads and comments.",
      "ViewerReads only.",
    ])
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Member/ }))
    expect(onChoose).not.toHaveBeenCalled()
    openMenu(/ben's role: Member/)
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Viewer/ }))
    expect(onChoose).toHaveBeenCalledWith("viewer")
  })
})
