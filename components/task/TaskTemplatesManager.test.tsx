import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

const offerUndo = vi.fn()
vi.mock("@/services/restoreService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/restoreService")>()),
  offerUndo: (...a: unknown[]) => offerUndo(...a),
}))

// No stubs for the body or the assignee: the editor writes the body in a plain box, in Markdown, with the codec's
// preview, and picks the assignee on the shared Select, as Type, Priority and Status are, from the lists the page's
// client read (app/firstLoad.test: the manager loads nothing that reaches the shared core, and opens no lazy chunk).

import ProjectTaskTemplatesDefault, { ProjectTaskTemplatesDialog, WorkspaceTaskTemplatesCard } from "@/components/task/TaskTemplatesManager"
import type { TaskTemplate, TemplateList } from "@/lib/work/taskTemplates"
import { placePaths, type KeepHttp } from "@/lib/work/taskTemplatesKeep"
import { projectFieldsKey } from "@/hooks/useProjectFields"
import { GetEndpointUrl } from "@/services/endPoints"

afterEach(() => {
  cleanup()
  offerUndo.mockReset()
})

const BUG = "5594da4f-672d-4b63-8887-3d4b83ae9cb5"
const OWN = "0b1e5c1e-0000-4000-8000-000000000001"
const types = [
  { id: BUG, builtin: "bug", name: "Bug", icon: "bug" },
  { id: OWN, name: "Incident", icon: "flag", own: true },
]
const list = (over: Partial<TemplateList> = {}): TemplateList => ({
  templates: [
    { id: "t1", project_id: "p", name: "Bug report", description: "What broke", default_for: BUG },
    { id: "w1", name: "Customer escalation" },
  ],
  defaults: { [BUG]: "t1" },
  can_manage: true,
  can_manage_workspace: false,
  types,
  ...over,
})
// Named as the server names them: user_name is the name shown (lib/personName), and an AI teammate has its kind.
const SAM = { user_uuid: "u-sam", user_name: "Sam Rivera", user_full_name: "Samuel Rivera" }
const OPS = { user_uuid: "a-ops", user_name: "Ops Agent", is_bot: true, user_bot_kind: "agent" }
// The preset assignee is an AI teammate the GET names (assignee_who): the picker shows them before any list loads.
const full = { id: "t1", project_id: "p", name: "Bug report", description: "What broke", default_for: BUG, shape: { name: "Bug: ", type: BUG, status: "Triage", assignee: OPS.user_uuid, description: "<h3>Steps</h3>" }, assignee_who: OPS } as TaskTemplate

/** The page's client, answering the list and one template, and keeping what's posted. */
function client(answer: TemplateList, template: TaskTemplate = full) {
  const posts: { path: string; body: unknown }[] = []
  const gets: string[] = []
  const http = {
    get: vi.fn(async (path: string) => {
      gets.push(path)
      if (/task-templates$/.test(path)) return { data: { data: answer } }
      if (/\/fields$/.test(path)) return { data: { data: { fields: [], can_edit: true } } }
      if (path.startsWith("/project/memberWithAdminFlag/")) return { data: { data: { project_members: [SAM] } } }
      if (path === "/user/dm-ai-targets") return { data: { data: [OPS] } }
      if (/\/statuses$/.test(path)) return { data: { data: { custom: [] } } }
      return { data: { data: template } }
    }),
    post: vi.fn(async (path: string, body: object) => {
      posts.push({ path, body })
      return { data: { data: full } }
    }),
  }
  // The fake answers whatever is asked; KeepHttp types each answer by its call.
  return { http: http as unknown as KeepHttp & typeof http, posts, gets }
}

describe("the task templates' manager (linear-09)", () => {
  it("lists a project's own templates and the workspace's, and keeps only what the caller may", async () => {
    const { http } = client(list())
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    const own = await screen.findByRole("list", { name: "This project's templates" })
    expect(within(own).getByText("Bug report")).toBeTruthy()
    expect(within(own).getByText("Default for Bug")).toBeTruthy()
    expect(within(own).getByRole("button", { name: "Edit Bug report" })).toBeTruthy()
    const shared = screen.getByRole("list", { name: "The workspace's templates" })
    expect(within(shared).queryByRole("button", { name: /Edit/ })).toBeNull()
    expect(screen.getByText("Kept by workspace admins in Admin › Permissions.")).toBeTruthy()
    expect(http.get).toHaveBeenCalledWith("/project/p/task-templates", { suppressErrorToast: true })
  })

  it("opens a template in full, and saves it back to its own place with what it doesn't show", async () => {
    const { http, posts, gets } = client(list())
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bug report" }))
    const name = await screen.findByLabelText("Template name")
    expect(gets).toContain("/project/p/task-templates/t1")
    fireEvent.change(name, { target: { value: "Bug intake" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save template" })))
    expect(posts).toEqual([{ path: "/project/p/task-templates/t1", body: expect.objectContaining({ name: "Bug intake", default_for: BUG, shape: expect.objectContaining({ status: "Triage", type: BUG, assignee: OPS.user_uuid, description: "<h3>Steps</h3>" }) }) }])
    await screen.findByRole("list", { name: "This project's templates" })
  })

  // A type's glyph draws beside its name, so it is read once: "Bug", never "Bug Bug" (the e2e's options by name).
  it("names a type once in the Type picker: its glyph is drawn beside the name, never read out with it", async () => {
    const { http } = client(list())
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bug report" }))
    await screen.findByLabelText("Template name")
    const type = screen.getByRole("combobox", { name: "Type" })
    await waitFor(() => expect(type.textContent).toBe("Bug"))
    expect(within(type).queryByRole("img")).toBeNull()
  })

  it("deletes a workspace template from a project through the workspace's calls, with Undo", async () => {
    const { http, posts } = client(list({ can_manage_workspace: true }))
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Delete Customer escalation" }))
    await waitFor(() => expect(posts.map((p) => p.path)).toEqual(["/project/task-templates/w1/delete"]))
    await waitFor(() => expect(offerUndo).toHaveBeenCalledWith("Deleted template “Customer escalation”", expect.any(Function)))
  })

  it("says what to fix before anything is sent, and the workspace's card makes a new one", async () => {
    const { http, posts } = client(list({ templates: [], defaults: {} }))
    render(<WorkspaceTaskTemplatesCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "New template" }))
    fireEvent.click(await screen.findByRole("button", { name: "Save template" }))
    expect((await screen.findByRole("alert")).textContent).toBe("Give the template a name.")
    expect(posts).toEqual([])
    fireEvent.change(screen.getByLabelText("Template name"), { target: { value: "Escalation" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save template" })))
    expect(posts).toEqual([{ path: "/project/task-templates", body: expect.objectContaining({ name: "Escalation", default_for: "" }) }])
  })

  it("reads the project's fields, people, AI teammates and statuses on the page's client: the page passes only that", async () => {
    const { http, gets } = client(list())
    render(<ProjectTaskTemplatesDefault http={http} projectId="p" onClose={() => {}} />)
    await screen.findByRole("list", { name: "This project's templates" })
    await waitFor(() => expect(gets).toEqual(expect.arrayContaining(["/project/p/fields", "/project/memberWithAdminFlag/p", "/user/dm-ai-targets", "/project/p/statuses"])))
    for (const path of ["/project/p/fields", "/project/memberWithAdminFlag/p", "/user/dm-ai-targets", "/project/p/statuses"]) {
      expect(http.get).toHaveBeenCalledWith(path, { suppressErrorToast: true })
    }
  })

  it("sets a preset assignee from the place's people and AI teammates, and writes the body in Markdown with a live preview", async () => {
    const { http, posts } = client(list())
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bug report" }))
    // The preset AI teammate, as the read names them (assignee_who), and named an AI teammate as New task's chip names
    // one ("Assignee: Ada, AI teammate"). The shared principal tag isn't drawn here: its module re-cut the /app shell.
    const assignee = await screen.findByRole("combobox", { name: "Assignee" })
    await waitFor(() => expect(assignee.textContent).toBe("Ops AgentAI teammate"))
    expect(assignee.querySelector("[data-principal-tag]")).toBeNull()
    expect(screen.getByRole("combobox", { name: "Status" }).textContent).toContain("Triage")
    // The shared Select, as Type, Priority and Status are: No one, the project's people, then the AI teammates, each
    // named once (a face or an agent's square is drawn beside the name).
    fireEvent.keyDown(assignee, { key: "ArrowDown" })
    await waitFor(() => expect(within(screen.getByRole("group", { name: "People" })).getByRole("option", { name: "Sam Rivera" })).toBeTruthy())
    expect(within(screen.getByRole("group", { name: "AI teammates" })).getByRole("option", { name: /^Ops Agent/ })).toBeTruthy()
    const options = screen.getAllByRole("option")
    expect(["No one", "Sam Rivera", /^Ops Agent/].map((name) => options.indexOf(screen.getByRole("option", { name })))).toEqual([0, 1, 2])
    fireEvent.click(screen.getByRole("option", { name: "Sam Rivera" }))
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" }).textContent).toContain("Sam Rivera"))
    // The body in Markdown, its preview drawn as its tasks will start, as it's typed.
    const body = screen.getByRole("textbox", { name: "Description" }) as HTMLTextAreaElement
    expect(body.value).toBe("### Steps")
    fireEvent.change(body, { target: { value: "### Steps to reproduce\n\n1. Open it" } })
    const preview = screen.getByRole("region", { name: "Preview" })
    await waitFor(() => expect(within(preview).getByRole("heading", { name: "Steps to reproduce" })).toBeTruthy())
    expect(within(preview).getByRole("listitem").textContent).toBe("Open it")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save template" })))
    expect(posts).toEqual([{ path: "/project/p/task-templates/t1", body: expect.objectContaining({ shape: expect.objectContaining({ assignee: SAM.user_uuid, status: "Triage", description: "<h3>Steps to reproduce</h3><ol><li><p>Open it</p></li></ol>" }) }) }])
  })

  // A preset assignee in neither list (someone who has since left the project) stays listed and chosen, as the read
  // names them (assignee_who), so the template keeps them until it's changed, as a preset status the place no longer
  // has does.
  it("keeps a preset assignee who is in neither list, listed and chosen as the read names them", async () => {
    const LEFT = { user_uuid: "u-left", user_name: "Lee Moved" }
    const { http, posts } = client(list(), { ...full, shape: { ...full.shape, assignee: LEFT.user_uuid }, assignee_who: LEFT } as TaskTemplate)
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "Edit Bug report" }))
    const assignee = await screen.findByRole("combobox", { name: "Assignee" })
    await waitFor(() => expect(assignee.textContent).toContain("Lee Moved"))
    fireEvent.keyDown(assignee, { key: "ArrowDown" })
    await waitFor(() => expect(within(screen.getByRole("group", { name: "People" })).getByRole("option", { name: "Sam Rivera" })).toBeTruthy())
    expect(screen.getByRole("option", { name: "Lee Moved" }).getAttribute("data-state")).toBe("checked")
    expect(within(screen.getByRole("group", { name: "People" })).queryByRole("option", { name: "Lee Moved" })).toBeNull()
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save template" })))
    expect(posts).toEqual([{ path: "/project/p/task-templates/t1", body: expect.objectContaining({ shape: expect.objectContaining({ assignee: LEFT.user_uuid }) }) }])
  })

  it("previews a body as the codec writes it: no script, handler or unsafe link from what's typed", async () => {
    const { http } = client(list())
    render(<ProjectTaskTemplatesDialog http={http} projectId="p" onClose={() => {}} />)
    fireEvent.click(await screen.findByRole("button", { name: "New template" }))
    const body = await screen.findByRole("textbox", { name: "Description" })
    expect(screen.queryByRole("region", { name: "Preview" })).toBeNull()
    fireEvent.change(body, { target: { value: "[open](javascript:alert(1)) <img src=x onerror=alert(1)> **now**" } })
    const preview = screen.getByRole("region", { name: "Preview" })
    await waitFor(() => expect(preview.querySelector("strong")?.textContent).toBe("now"))
    expect(preview.innerHTML).not.toMatch(/javascript|onerror|alert/)
    expect(preview.querySelector("a")).toBeNull()
  })

  it("lets the workspace's templates preset an AI teammate and a built-in status, reading no project", async () => {
    const { http, gets, posts } = client(list({ templates: [], defaults: {} }))
    render(<WorkspaceTaskTemplatesCard http={http} />)
    fireEvent.click(await screen.findByRole("button", { name: "New template" }))
    fireEvent.change(await screen.findByLabelText("Template name"), { target: { value: "Escalation" } })
    // Every project's: No one and the AI teammates (people are per project).
    fireEvent.keyDown(await screen.findByRole("combobox", { name: "Assignee" }), { key: "ArrowDown" })
    await waitFor(() => expect(within(screen.getByRole("group", { name: "AI teammates" })).getByRole("option", { name: /^Ops Agent/ })).toBeTruthy())
    expect(screen.getByRole("option", { name: "No one" })).toBeTruthy()
    expect(screen.queryByRole("group", { name: "People" })).toBeNull()
    expect(screen.queryByRole("option", { name: "Sam Rivera" })).toBeNull()
    fireEvent.click(screen.getByRole("option", { name: /^Ops Agent/ }))
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Assignee" }).textContent).toContain("Ops Agent"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save template" })))
    expect(posts).toEqual([{ path: "/project/task-templates", body: expect.objectContaining({ shape: expect.objectContaining({ assignee: OPS.user_uuid }) }) }])
    expect(gets.filter((g) => /fields|memberWithAdminFlag|statuses/.test(g))).toEqual([])
  })

  it("reads each list at the path the page's own reads use", () => {
    expect(placePaths.fields("p")).toBe(projectFieldsKey("p"))
    expect(placePaths.people("p")).toBe(`${GetEndpointUrl.GetProjectMembers}/p`)
    expect(placePaths.teammates).toBe(GetEndpointUrl.GetDMableAITargets)
  })

  it("shows no keeping to someone who keeps nothing here", async () => {
    const { http } = client(list({ can_manage: false }))
    render(<WorkspaceTaskTemplatesCard http={http} />)
    await screen.findByText("Bug report")
    expect(screen.queryByRole("button", { name: "New template" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Edit|Delete/ })).toBeNull()
  })
})
