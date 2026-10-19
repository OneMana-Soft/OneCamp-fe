import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PolicyInfo } from "@/services/workAccessService"

// The workspace's defaults for projects: who changes tasks where a project
// hasn't chosen its own.

const policy = (key: string, value: string, choices: string[]): PolicyInfo => ({
  key, kind: "choice", label: key, help: "", value, default: choices[0], is_set: false, choices,
})
let policies: PolicyInfo[] | undefined
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: policies ? { data: policies } : undefined, isError: false, mutate: vi.fn() }),
}))
vi.mock("@/lib/swrMutate", () => ({ appMutate: vi.fn(async () => undefined) }))
const put = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", () => ({ default: { put }, OWN_ERRORS: { suppressErrorToast: true } }))

const { default: ProjectsPermissionsCard } = await import("./ProjectsPermissionsCard")

afterEach(() => {
  cleanup()
  policies = undefined
  put.mockReset()
})

describe("the workspace's project permissions", () => {
  it("says who changes tasks, and nothing the web can't yet follow", () => {
    policies = [
      policy("docs.follow", "on", ["on", "off"]),
      policy("projects.edit.who", "members", ["members", "assigned", "admins"]),
      policy("projects.create.who", "team_admins", ["team_admins", "team_members"]),
    ]
    render(<ProjectsPermissionsCard />)
    expect(screen.getByRole("radiogroup", { name: "Who can change tasks" })).toBeTruthy()
    // The new-project dialog lists the teams a person runs, so the policy
    // for who makes projects stays off the card.
    expect(screen.queryByRole("radiogroup", { name: "Who can make projects" })).toBeNull()
    expect(screen.getByRole("radio", { name: "Members" }).getAttribute("data-state")).toBe("checked")
  })

  it("saves a new default as it is picked", async () => {
    policies = [policy("projects.edit.who", "members", ["members", "assigned", "admins"])]
    put.mockResolvedValue({ data: { data: { ...policies[0], value: "admins", is_set: true } } })
    render(<ProjectsPermissionsCard />)
    fireEvent.click(screen.getByRole("radio", { name: "Admins" }))
    await waitFor(() => expect(put).toHaveBeenCalledWith("/admin/policies/projects.edit.who", { value: "admins" }, { suppressErrorToast: true }))
  })
})
