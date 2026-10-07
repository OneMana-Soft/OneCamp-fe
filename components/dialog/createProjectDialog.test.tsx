import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const teams = { data: [{ team_uuid: "team-1", team_name: "Studio" }] }
vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: teams, isLoading: false }) }))

const sent: Record<string, unknown>[] = []
let reply: unknown = { project_uuid: "p-1", project_name: "Acme site" }
vi.mock("@/hooks/usePost", () => ({
  usePost: () => ({
    isSubmitting: false,
    makeRequest: async ({ payload }: { payload: Record<string, unknown> }) => {
      sent.push(payload)
      return reply
    },
  }),
}))
const pushed: string[] = []
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: (u: string) => pushed.push(u) }) }))
const dispatched: unknown[] = []
vi.mock("react-redux", () => ({ useDispatch: () => (a: unknown) => dispatched.push(a) }))
const toasts: unknown[] = []
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: unknown) => toasts.push(t) }) }))
// The picker has its own tests; here it is a stand-in that chooses a template.
const plan = { name: "App launch", tasks: [{ name: "Plan" }] }
vi.mock("@/components/projectTemplates/TemplatePicker", () => ({
  TemplatePicker: ({ value, onChange, onChosen, onDraft }: { value: string; onChange: (id: string) => void; onChosen: (t: unknown) => void; onDraft: (t: unknown) => void }) => (
    <>
    <button type="button" onClick={() => { onDraft(plan); onChange("ai-draft"); onChosen({ id: "ai-draft", name: "App launch", task_count: 1, preview: [], built_in: false, description: "", can_delete: false }) }}>draft</button>
    <button
      type="button"
      data-value={value}
      onClick={() => {
        onChange("client-project")
        onChosen({ id: "client-project", name: "Client project", task_count: 13, preview: [], built_in: true, description: "", can_delete: false })
      }}
    >
      choose
    </button>
    </>
  ),
}))

const { default: CreateProjectDialog } = await import("./createProjectDialog")

afterEach(() => {
  cleanup()
  sent.length = pushed.length = dispatched.length = toasts.length = 0
  reply = { project_uuid: "p-1", project_name: "Acme site" }
})

// With one team it is chosen for you; the name is typed once that has settled,
// as a person would, since both validate the whole form.
const typeName = async () => {
  await screen.findByText("Studio")
  await act(async () => {})
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme site" } })
}

describe("New project", () => {
  it("makes a blank project with just its name and team", async () => {
    render(<CreateProjectDialog dialogOpenState setOpenState={() => {}} />)
    await typeName()
    await waitFor(() => expect((screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(false))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create project" })))
    expect(sent).toEqual([{ project_name: "Acme site", project_team_uuid: "team-1" }])
    expect(pushed).toEqual(["/app/project/p-1"])
  })

  it("sends the template, the start day, the zone and weekends, and says so on the button", async () => {
    render(<CreateProjectDialog dialogOpenState setOpenState={() => {}} />)
    await typeName()
    fireEvent.click(screen.getByRole("button", { name: "choose" }))
    fireEvent.change(screen.getByLabelText("Starts on"), { target: { value: "2026-11-02" } })
    fireEvent.click(screen.getByRole("checkbox"))
    const create = await screen.findByRole("button", { name: "Create with 13 tasks" })
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false))
    await act(async () => fireEvent.click(create))
    expect(sent[0]).toMatchObject({ project_name: "Acme site", template_id: "client-project", start_date: "2026-11-02", skip_weekends: false })
    expect(typeof sent[0].tz).toBe("string")
    expect(toasts).toEqual([])
  })

  it("opens on a template chosen before it opened", () => {
    render(<CreateProjectDialog dialogOpenState setOpenState={() => {}} initialTemplateId="event" />)
    expect(screen.getByRole("button", { name: "choose" }).getAttribute("data-value")).toBe("event")
    expect(screen.getByLabelText("Starts on")).toBeTruthy()
  })

  it("tells the person when some of the template's tasks weren't made", async () => {
    reply = { project_uuid: "p-2", project_name: "Acme site", template: { statuses: 1, tasks: 10, failed: 3 } }
    render(<CreateProjectDialog dialogOpenState setOpenState={() => {}} />)
    await typeName()
    fireEvent.click(screen.getByRole("button", { name: "choose" }))
    const create = await screen.findByRole("button", { name: "Create with 13 tasks" })
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false))
    await act(async () => fireEvent.click(create))
    expect(toasts).toEqual([expect.objectContaining({ variant: "destructive", title: "10 of 13 tasks were made" })])
    // The project goes into the sidebar list without the template's counts.
    expect(JSON.stringify(dispatched)).not.toContain("failed")
    expect(pushed).toEqual(["/app/project/p-2"])
  })

  it("sends a plan the AI drafted whole, since it isn't saved", async () => {
    render(<CreateProjectDialog dialogOpenState setOpenState={() => {}} />)
    await typeName()
    fireEvent.click(screen.getByRole("button", { name: "draft" }))
    const create = await screen.findByRole("button", { name: "Create with 1 task" })
    await waitFor(() => expect((create as HTMLButtonElement).disabled).toBe(false))
    await act(async () => fireEvent.click(create))
    expect(sent[0]).toMatchObject({ project_name: "Acme site", template: plan })
    expect(sent[0].template_id).toBeUndefined()
  })
})
