import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// A project's key and types (A8K), for its admins: the key its tasks read as,
// the keys it had, which keep working, and its types.

const { toast, api, key, types } = vi.hoisted(() => ({
  toast: vi.fn(),
  api: { setProjectKey: vi.fn(), createProjectType: vi.fn(), updateProjectType: vi.fn(), archiveProjectType: vi.fn() },
  key: { key: "Q4", next_number: 38, aliases: ["WEB"] },
  types: [
    { id: "t1", builtin: "bug", name: "Bug", icon: "bug" },
    { id: "t3", builtin: "milestone", name: "Milestone", icon: "milestone" },
    { id: "x9", name: "Spike", icon: "flask", own: true },
  ],
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url.endsWith("/key") ? { data: key } : url.endsWith("/types") ? { data: types, icons: [] } : undefined, mutate: vi.fn() }),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))
vi.mock("@/lib/work/keysApi", async (orig) => ({ ...(await orig<typeof import("@/lib/work/keysApi")>()), ...api }))

import { ProjectKeyTypesDialog } from "./ProjectKeyTypesDialog"

afterEach(() => {
  cleanup()
  toast.mockReset()
  Object.values(api).forEach((f) => f.mockReset())
})

const open = () => render(<ProjectKeyTypesDialog projectId="p1" open onOpenChange={() => {}} />)

describe("a project's key", () => {
  it("shows the key, the next task's key, and the keys it had", () => {
    open()
    expect((screen.getByLabelText("Key") as HTMLInputElement).value).toBe("Q4")
    expect(screen.getByText("The next task is Q4-38.")).toBeTruthy()
    expect(screen.getByText("Links with WEB still open their tasks.")).toBeTruthy()
    expect((screen.getByRole("button", { name: "Save key" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("says what a key may be, and saves one in capitals", async () => {
    api.setProjectKey.mockResolvedValue({ key: "LNCH", next_number: 38, aliases: ["Q4", "WEB"] })
    open()
    const input = screen.getByLabelText("Key")
    fireEvent.change(input, { target: { value: "1a" } })
    expect(screen.getByText("2 to 5 letters and digits, starting with a letter.")).toBeTruthy()
    fireEvent.change(input, { target: { value: "lnch" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save key" })))
    await waitFor(() => expect(api.setProjectKey).toHaveBeenCalledWith("p1", "LNCH"))
    expect(toast.mock.calls[0][0].description).toBe("Q4 links keep working.")
  })

  it("says why a key another project has can't be taken", async () => {
    api.setProjectKey.mockRejectedValue({ response: { status: 409, data: { msg: "OPS is taken by another project. Try another key." } } })
    open()
    fireEvent.change(screen.getByLabelText("Key"), { target: { value: "OPS" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save key" })))
    await waitFor(() => expect(toast).toHaveBeenCalled())
    expect(toast.mock.calls[0][0]).toMatchObject({ title: "Couldn't change the key", description: "OPS is taken by another project. Try another key.", tone: "error" })
  })
})

describe("a project's types", () => {
  it("lists the built-in ones, then its own, and adds one", async () => {
    api.createProjectType.mockResolvedValue({ id: "x10", name: "Research", icon: "flag", own: true })
    open()
    expect(screen.getByRole("list", { name: "Built in" }).textContent).toContain("Milestone")
    expect((screen.getByLabelText("The name of Spike") as HTMLInputElement).value).toBe("Spike")
    fireEvent.change(screen.getByLabelText("The new type's name"), { target: { value: "Research" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add type" })))
    await waitFor(() => expect(api.createProjectType).toHaveBeenCalledWith("p1", "Research", "flag"))
  })

  it("archives its own type, whose tasks keep it", async () => {
    api.archiveProjectType.mockResolvedValue(undefined)
    open()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Archive Spike; its tasks keep it" })))
    await waitFor(() => expect(api.archiveProjectType).toHaveBeenCalledWith("p1", "x9"))
  })
})
