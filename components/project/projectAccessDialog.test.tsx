import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PolicyInfo } from "@/services/workAccessService"
import type { ProjectCalls } from "@/hooks/useProjectPolicy"

// Who can change a project's tasks: its admins choose, the choice shows at
// once, and a refusal puts it back with the server's words.

let info: PolicyInfo | undefined
const mutated: unknown[] = []
const saved: Array<[string, unknown]> = []
let refuse = false
// The page hands the dialog its client and cache (hooks/useProjectPolicy's ProjectCalls).
const calls: ProjectCalls = {
  http: {
    get: vi.fn(async () => ({ data: { data: info ? [info] : [] } })),
    put: vi.fn(async (url: string, body?: unknown) => {
      const value = (body as { value: unknown }).value
      saved.push([url.split("/")[2], value])
      if (refuse) throw Object.assign(new Error("refused"), { response: { data: { msg: "Only the project's admins choose who can change its tasks." } } })
      // The saved answer is what the project's read says from now on.
      info = { ...info!, value: value ?? info!.default, is_set: value !== null }
      return { data: { data: info } }
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as ProjectCalls["http"],
  quiet: {},
  mutate: vi.fn(async (key: unknown) => void mutated.push(key)),
  policies: "/project/p-1/policies",
  confirm: vi.fn(),
}

const { ProjectAccessDialog, chosenOf } = await import("./ProjectAccessDialog")

const workspaceMembers: PolicyInfo = {
  key: "projects.edit.who", kind: "choice", label: "Who can change tasks", help: "", value: "members", default: "members", is_set: false,
  choices: ["members", "assigned", "admins"],
}

afterEach(() => {
  cleanup()
  info = undefined
  saved.length = 0
  mutated.length = 0
  refuse = false
})

describe("who can change a project's tasks", () => {
  it("follows the workspace until the project chooses", async () => {
    expect(chosenOf(workspaceMembers)).toBe("workspace")
    expect(chosenOf({ ...workspaceMembers, value: "admins", is_set: true })).toBe("admins")
    expect(chosenOf(undefined)).toBe("")
  })

  it("offers every choice, each in words, with the workspace's named", async () => {
    info = workspaceMembers
    render(<ProjectAccessDialog projectId="p-1" calls={calls} open onOpenChange={() => {}} />)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Members", "Members, on their own tasks", "Admins only", "As the workspace has it"])
    expect(screen.getByRole("radio", { name: "As the workspace has it" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByText("Members, and it follows if a workspace admin changes it.")).toBeTruthy()
  })

  it("saves a choice for the project, and gives it back to the workspace with null", async () => {
    info = workspaceMembers
    render(<ProjectAccessDialog projectId="p-1" calls={calls} open onOpenChange={() => {}} />)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
    fireEvent.click(screen.getByRole("radio", { name: "Admins only" }))
    await waitFor(() => expect(saved).toEqual([["p-1", "admins"]]))
    // What people may do in the project is asked again.
    await waitFor(() => expect(mutated.some((k) => typeof k === "function")).toBe(true))
    fireEvent.click(screen.getByRole("radio", { name: "As the workspace has it" }))
    await waitFor(() => expect(saved).toEqual([["p-1", "admins"], ["p-1", null]]))
  })

  it("puts the choice back, with why, when it is refused", async () => {
    info = workspaceMembers
    refuse = true
    render(<ProjectAccessDialog projectId="p-1" calls={calls} open onOpenChange={() => {}} />)
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))))
    fireEvent.click(screen.getByRole("radio", { name: "Admins only" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "As the workspace has it" }).getAttribute("data-state")).toBe("checked")
  })
})
