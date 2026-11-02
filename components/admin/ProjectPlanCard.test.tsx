import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// linear-15 head 2b part 2: Settings > Permissions keeps the workspace's own project statuses, in the five
// categories, and its labels. The page reads them (usePlanRegistryEdits) and hands them in, so this lazy card holds no
// request code of its own (main's chunking rule, 30 Oct); Undo's restore goes on the page's client.
const offered = vi.hoisted(() => vi.fn())
vi.mock("@/services/restoreService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/restoreService")>()),
  offerUndo: (...args: unknown[]) => offered(...args),
}))

import ProjectPlanCard from "@/components/admin/ProjectPlanCard"
import { nextLabelColor, type PlanRegistry } from "@/lib/work/projectPlan"
import { STORED_NAME, statusHueOf } from "@/lib/taskStatus"

const REGISTRY: PlanRegistry = {
  categories: [
    { key: "planned", name: "Planned", color: "slate" },
    { key: "in_progress", name: "In progress", color: "amber" },
    { key: "paused", name: "Paused", color: "orange" },
    { key: "done", name: "Done", color: "green" },
    { key: "cancelled", name: "Cancelled", color: "red" },
  ],
  statuses: [
    { id: "s2", name: "Building", color: "amber", category: "in_progress", position: 7 },
    { id: "s1", name: "Scoping", color: "sky", category: "in_progress", position: 3 },
    { id: "s3", name: "Shipped", color: "emerald", category: "done", position: 9 },
  ],
  labels: [{ id: "l1", name: "Revenue", color: "teal" }],
  colors: ["slate", "amber", "emerald", "teal", "sky", "violet", "rose"],
}

const refusal = (msg: string) => Object.assign(new Error("Request failed"), { isAxiosError: true, response: { status: 400, data: { msg } } })

function plan(over: Record<string, unknown> = {}) {
  return {
    registry: REGISTRY as PlanRegistry | undefined,
    failed: false,
    retry: vi.fn(),
    addStatus: vi.fn<(s: object) => Promise<void>>(async () => {}),
    editStatus: vi.fn<(id: string, c: object) => Promise<void>>(async () => {}),
    deleteStatus: vi.fn<(id: string) => Promise<void>>(async () => {}),
    addLabel: vi.fn<(l: object) => Promise<void>>(async () => {}),
    editLabel: vi.fn<(id: string, c: object) => Promise<void>>(async () => {}),
    deleteLabel: vi.fn<(id: string) => Promise<void>>(async () => {}),
    order: vi.fn<(ids: string[]) => Promise<void>>(async () => {}),
    ...over,
  }
}
const http = { post: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})) }
const names = (group: HTMLElement) => within(group).queryAllByRole("listitem").map((li) => li.getAttribute("aria-label"))
const nameBox = (status: string) => within(screen.getByRole("listitem", { name: status })).getByRole("textbox", { name: /name$/ })

afterEach(() => {
  cleanup()
  offered.mockClear()
  http.post.mockClear()
})

describe("the workspace's project statuses and labels, as an admin keeps them (linear-15)", () => {
  it("lists each category's own statuses under it, in their order, and the labels", () => {
    render(<ProjectPlanCard plan={plan()} http={http} />)
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Planned", "In progress", "Paused", "Done", "Cancelled"])
    expect(names(screen.getByRole("group", { name: "In progress" }))).toEqual(["Scoping", "Building"])
    expect(names(screen.getByRole("group", { name: "Done" }))).toEqual(["Shipped"])
    expect(names(screen.getByRole("group", { name: "Planned" }))).toEqual([])
    expect(names(screen.getByRole("list", { name: "Project labels" }))).toEqual(["Revenue"])
    // Each colour says whose it is and which it is, once: "Colour of Scoping: Dusk".
    expect(screen.getByRole("button", { name: /^Colour of Scoping: \w+$/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /^Colour of Revenue: \w+$/ })).toBeTruthy()
  })

  it("renames a status on Enter, puts the name back on Escape, and says the server's words when it refuses", async () => {
    const p = plan()
    render(<ProjectPlanCard plan={p} http={http} />)
    fireEvent.change(nameBox("Scoping"), { target: { value: "Discovery" } })
    await act(async () => fireEvent.keyDown(nameBox("Scoping"), { key: "Enter" }))
    expect(p.editStatus).toHaveBeenCalledWith("s1", { name: "Discovery" })

    fireEvent.change(nameBox("Building"), { target: { value: "Build" } })
    fireEvent.keyDown(nameBox("Building"), { key: "Escape" })
    expect(nameBox("Building")).toHaveProperty("value", "Building")
    expect(p.editStatus).toHaveBeenCalledTimes(1)

    p.editStatus.mockRejectedValueOnce(refusal("There's a status with that name already."))
    fireEvent.change(nameBox("Building"), { target: { value: "Shipped" } })
    await act(async () => fireEvent.blur(nameBox("Building")))
    expect(within(screen.getByRole("listitem", { name: "Building" })).getByRole("alert").textContent).toBe("There's a status with that name already.")
    expect(nameBox("Building")).toHaveProperty("value", "Building")
  })

  it("moves a status within its category, never past its ends", async () => {
    const p = plan()
    render(<ProjectPlanCard plan={p} http={http} />)
    const scoping = within(screen.getByRole("listitem", { name: "Scoping" }))
    expect(scoping.getByRole("button", { name: "Move up" })).toHaveProperty("disabled", true)
    await act(async () => fireEvent.click(scoping.getByRole("button", { name: "Move down" })))
    expect(p.order).toHaveBeenCalledWith(["s2", "s1"])
    expect(within(screen.getByRole("listitem", { name: "Shipped" })).getByRole("button", { name: "Move down" })).toHaveProperty("disabled", true)
  })

  it("deletes a status and a label with Undo, which restores each on the page's client", async () => {
    const p = plan()
    render(<ProjectPlanCard plan={p} http={http} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete Scoping" })))
    expect(p.deleteStatus).toHaveBeenCalledWith("s1")
    expect(offered.mock.calls[0][0]).toBe("Deleted status “Scoping”")
    await act(() => offered.mock.calls[0][1]())
    expect(http.post).toHaveBeenCalledWith("/restore/project_status/s1", {}, { suppressErrorToast: true })

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete Revenue" })))
    expect(p.deleteLabel).toHaveBeenCalledWith("l1")
    expect(offered.mock.calls[1][0]).toBe("Deleted label “Revenue”")
    await act(() => offered.mock.calls[1][1]())
    expect(http.post).toHaveBeenLastCalledWith("/restore/project_label/l1", {}, { suppressErrorToast: true })
    expect(p.retry).toHaveBeenCalledTimes(2)
  })

  it("adds a status to a category in its colour, and a label in the next colour", async () => {
    const p = plan()
    render(<ProjectPlanCard plan={p} http={http} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a status to Paused" }))
    const box = screen.getByRole("textbox", { name: "New status name" })
    fireEvent.change(box, { target: { value: "  On hold " } })
    await act(async () => fireEvent.keyDown(box, { key: "Enter" }))
    expect(p.addStatus).toHaveBeenCalledWith({ name: "On hold", category: "paused", color: STORED_NAME[statusHueOf("orange")] })

    fireEvent.click(screen.getByRole("button", { name: "Add a label" }))
    const label = screen.getByRole("textbox", { name: "New label name" })
    fireEvent.change(label, { target: { value: "Ops" } })
    await act(async () => fireEvent.keyDown(label, { key: "Enter" }))
    expect(p.addLabel).toHaveBeenCalledWith({ name: "Ops", color: nextLabelColor(1) })
  })

  it("holds Add at the workspace's caps, in the server's words", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ id: `x${i}`, name: `S${i}`, color: "amber", category: "planned" as const, position: i }))
    const labels = Array.from({ length: 300 }, (_, i) => ({ id: `y${i}`, name: `L${i}`, color: "teal" }))
    render(<ProjectPlanCard plan={plan({ registry: { ...REGISTRY, statuses: many, labels } })} http={http} />)
    expect(screen.getByRole("button", { name: "Add a status to Done" })).toHaveProperty("disabled", true)
    expect(screen.getByText("The workspace has 50 statuses, as many as it may. Delete one first.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Add a label" })).toHaveProperty("disabled", true)
    expect(screen.getByText("The workspace has 300 labels, as many as it may. Delete one first.")).toBeTruthy()
  })

  it("waits for the registry, and offers Try again when it can't be read", () => {
    const p = plan({ registry: undefined, failed: true })
    render(<ProjectPlanCard plan={p} http={http} />)
    fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0])
    expect(p.retry).toHaveBeenCalled()
    cleanup()
    render(<ProjectPlanCard plan={plan({ registry: undefined })} http={http} />)
    expect(screen.getByLabelText("Loading the project statuses")).toBeTruthy()
  })
})
