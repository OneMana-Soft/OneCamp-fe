import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { TaskRestriction } from "@/lib/work/restrictionApi"
import type { UserProfileDataInterface } from "@/types/user"

// The server's answer to GET /task/{id}/restriction, as the dialog reads it.
let answer: TaskRestriction | undefined
const mutate = vi.fn(async (next?: { data: TaskRestriction }) => {
  if (next) answer = next.data
})
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (key: string) => ({ data: key && answer ? { data: answer } : undefined, isLoading: !answer, isError: undefined, mutate }),
}))
const put = vi.fn()
vi.mock("@/lib/work/restrictionApi", async (orig) => ({
  ...(await orig<typeof import("@/lib/work/restrictionApi")>()),
  setRestriction: (...args: unknown[]) => put(...args),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: undefined }) }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true }) }))

const { TaskVisibilityRow } = await import("@/components/task/TaskVisibility")
const { default: TaskVisibilityDialog, findPeople } = await import("@/components/task/TaskVisibilityDialog")

const person = (id: string, name: string, email = `${name.toLowerCase()}@acme.test`) => ({ user_uuid: id, user_name: name, user_email_id: email }) as UserProfileDataInterface
const ana = person("u-ana", "Ana")
const ben = person("u-ben", "Ben")
const ivy = person("u-ivy", "Ivy")
const members = [ana, ben, ivy]

const base = { taskUUID: "t-1", taskName: "Zephyr pay review", members, alwaysIn: ["u-ana"], onChanged: vi.fn(), onOpenTask: vi.fn() }
const restriction = (over: Partial<TaskRestriction> = {}): TaskRestriction => ({ task_uuid: "t-1", restricted: false, people: [], can_change: true, ...over })

beforeEach(() => {
  answer = undefined
  put.mockReset()
  put.mockImplementation(async (_id: string, restricted: boolean, people: string[] = []) => restriction({ restricted, people }))
  mutate.mockClear()
  toast.mockClear()
  base.onChanged.mockClear()
})
afterEach(cleanup)

// WA2b: the panel's "Who can see" row. A task its whole project sees says
// nothing to someone who can't change that; a restricted one tells everyone
// it shows to, with its lock.
describe("the panel's who-can-see row", () => {
  it("is offered to whoever may restrict the task", () => {
    render(<TaskVisibilityRow {...base} restricted={false} canChange />)
    expect(screen.getByRole("button", { name: /Who can see this task: Everyone in the project\. Change who can see it/ })).toBeTruthy()
  })

  it("is shown, with its lock, on a restricted task to anyone it shows to", () => {
    const { container } = render(<TaskVisibilityRow {...base} restricted canChange={false} />)
    const value = screen.getByRole("button", { name: /Only some people\. See who can/ })
    expect(value.querySelector("svg")!.getAttribute("class")).toContain("lucide-lock")
    expect(container.querySelector("[data-property='visibility']")).toBeTruthy()
  })

  it("isn't there for a member on a task the project sees", () => {
    const { container } = render(<TaskVisibilityRow {...base} restricted={false} canChange={false} />)
    expect(container.innerHTML).toBe("")
  })
})

describe("the who-can-see dialog", () => {
  it("keeps a task to a few people, and names who always sees it", async () => {
    answer = restriction()
    render(<TaskVisibilityDialog {...base} restricted={false} canChange onClose={() => {}} />)
    expect(screen.getByRole("dialog", { name: "Who can see this task" })).toBeTruthy()
    fireEvent.keyDown(screen.getByRole("button", { name: /Everyone in the project/ }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Only some people/ }))
    await waitFor(() => expect(put).toHaveBeenCalledWith("t-1", true, []))
    await waitFor(() => expect(base.onChanged).toHaveBeenCalledWith(true))
  })

  it("adds people from the project, and takes them off again", async () => {
    answer = restriction({ restricted: true, people: ["u-ivy"] })
    const { rerender } = render(<TaskVisibilityDialog {...base} restricted canChange onClose={() => {}} />)
    expect(screen.getByText("Ivy")).toBeTruthy()
    // One role is no choice: no role menu in the invite row.
    expect(screen.queryByRole("button", { name: /^Role:/ })).toBeNull()
    fireEvent.change(screen.getByRole("combobox", { name: "Add people" }), { target: { value: "be" } })
    fireEvent.click(await screen.findByRole("option", { name: /Ben/ }))
    fireEvent.click(screen.getByRole("button", { name: "Invite" }))
    await waitFor(() => expect(put).toHaveBeenCalledWith("t-1", true, ["u-ivy", "u-ben"]))
    rerender(<TaskVisibilityDialog {...base} restricted canChange onClose={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "Ivy: Can see" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove access" }))
    await waitFor(() => expect(put).toHaveBeenLastCalledWith("t-1", true, ["u-ben"]))
  })

  it("says who always sees it can't be added", async () => {
    answer = restriction({ restricted: true })
    render(<TaskVisibilityDialog {...base} restricted canChange onClose={() => {}} />)
    expect(screen.getByText("No one else yet. Add people from the project.")).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox", { name: "Add people" }), { target: { value: "an" } })
    const option = await screen.findByRole("option", { name: /Ana/ })
    expect(option.getAttribute("aria-disabled")).toBe("true")
    expect(option.textContent).toContain("Already has access")
  })

  it("only shows who can see it to someone who can't change it", () => {
    answer = restriction({ restricted: true, people: ["u-ivy"], can_change: false })
    render(<TaskVisibilityDialog {...base} restricted canChange={false} onClose={() => {}} />)
    expect(screen.queryByRole("combobox", { name: "Add people" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Only some people/ })).toBeNull()
    expect(screen.getByText("Can see")).toBeTruthy()
  })

  it("sends a sub-task's people to the task it's part of", () => {
    answer = restriction({ restricted: true, restricted_with: "t-0", people: ["u-ivy"] })
    render(<TaskVisibilityDialog {...base} restricted canChange onClose={() => {}} />)
    expect(screen.getByText("It's kept to the people of the task it's part of.")).toBeTruthy()
    expect(screen.queryByRole("combobox", { name: "Add people" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open the task it's part of" }))
    expect(base.onOpenTask).toHaveBeenCalledWith("t-0")
  })

  it("says a refused change, and changes nothing", async () => {
    answer = restriction()
    put.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only this project's admins, or whoever made the task, can choose who sees it." } } })
    render(<TaskVisibilityDialog {...base} restricted={false} canChange onClose={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: /Everyone in the project/ }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Only some people/ }))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't change who can see this task", tone: "error" })
    expect(base.onChanged).not.toHaveBeenCalled()
  })

  it("finds the project's people by name or address, from two letters", () => {
    expect(findPeople(members, "b")).toEqual([])
    expect(findPeople(members, "IVY@").map((m) => m.user_uuid)).toEqual(["u-ivy"])
  })
})
