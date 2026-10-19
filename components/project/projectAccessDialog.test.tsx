import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PolicyInfo } from "@/services/workAccessService"

// Who can change a project's tasks: its admins choose, the choice shows at
// once, and a refusal puts it back with the server's words.

let info: PolicyInfo | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url && info ? { data: [info] } : undefined, isError: false, mutate: vi.fn() }),
}))
const mutated: unknown[] = []
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(async (key: unknown) => void mutated.push(key)) }))
const saved: Array<[string, unknown]> = []
let refuse = false
vi.mock("@/services/workAccessService", async (orig) => ({
  ...(await orig<typeof import("@/services/workAccessService")>()),
  setProjectEditWho: vi.fn(async (project: string, value: unknown) => {
    saved.push([project, value])
    if (refuse) throw Object.assign(new Error("refused"), { response: { data: { msg: "Only the project's admins choose who can change its tasks." } } })
    // The saved answer is what the project's read says from now on.
    info = { ...info!, value: value ?? info!.default, is_set: value !== null }
    return info
  }),
}))

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
  it("follows the workspace until the project chooses", () => {
    expect(chosenOf(workspaceMembers)).toBe("workspace")
    expect(chosenOf({ ...workspaceMembers, value: "admins", is_set: true })).toBe("admins")
    expect(chosenOf(undefined)).toBe("")
  })

  it("offers every choice, each in words, with the workspace's named", () => {
    info = workspaceMembers
    render(<ProjectAccessDialog projectId="p-1" open onOpenChange={() => {}} />)
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["Members", "Members, on their own tasks", "Admins only", "As the workspace has it"])
    expect(screen.getByRole("radio", { name: "As the workspace has it" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByText("Members, and it follows if a workspace admin changes it.")).toBeTruthy()
  })

  it("saves a choice for the project, and gives it back to the workspace with null", async () => {
    info = workspaceMembers
    render(<ProjectAccessDialog projectId="p-1" open onOpenChange={() => {}} />)
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
    render(<ProjectAccessDialog projectId="p-1" open onOpenChange={() => {}} />)
    fireEvent.click(screen.getByRole("radio", { name: "Admins only" }))
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByRole("radio", { name: "As the workspace has it" }).getAttribute("data-state")).toBe("checked")
  })
})
