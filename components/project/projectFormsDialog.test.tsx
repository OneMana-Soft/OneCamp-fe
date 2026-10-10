import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ProjectForm } from "@/lib/forms/forms"

const post = vi.fn(async () => ({ data: {} }))
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...(a as [])) } }))
const form = (over: Partial<ProjectForm>): ProjectForm =>
  ({ id: "f1", token: "tok1", title: "Launch requests", active: true, fields: [{ id: "q1", label: "What?", type: "short_text", required: true }], submissions: 3, ...over }) as ProjectForm
let forms: ProjectForm[] = [form({})]
const mutate = vi.fn()
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: { data: { forms, can_edit: true } }, isLoading: false, mutate }),
}))
const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const { ProjectFormsDialog } = await import("@/components/project/ProjectFormsDialog")

afterEach(() => {
  cleanup()
  post.mockClear()
  forms = [form({})]
})

describe("deleting a form", () => {
  it("asks first, in red, saying the link stops and the tasks stay", () => {
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch requests" }))
    expect(post).not.toHaveBeenCalled()
    const ask = screen.getByRole("group", { name: "Delete Launch requests" })
    expect(ask.textContent).toContain("Delete “Launch requests”?")
    expect(ask.textContent).toContain("Its link stops working for anyone who has it.")
    expect(ask.textContent).toContain("The 3 tasks its answers made stay in the project.")
    expect(ask.textContent).toContain("This can't be undone.")
    expect(screen.getByRole("button", { name: "Delete form" }).className).toMatch(/destructive/)
  })

  it("says so when nobody has answered", () => {
    forms = [form({ submissions: 0 })]
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch requests" }))
    expect(screen.getByRole("group", { name: "Delete Launch requests" }).textContent).toContain("Nobody has answered it yet.")
  })

  it("deletes only when confirmed", async () => {
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch requests" }))
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Delete Launch requests" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete form" })))
    expect(post).toHaveBeenCalledWith(expect.stringMatching(/\/f1\/delete$/), {})
  })
})

describe("opening the Forms dialog", () => {
  it("focuses the dialog itself, not its first button, so nothing lights up before a key is pressed", () => {
    render(<ProjectFormsDialog projectId="p" open onOpenChange={() => {}} />)
    expect(document.activeElement?.getAttribute("role")).toBe("dialog")
  })
})
