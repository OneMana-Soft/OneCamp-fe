import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { TemplateSummary } from "@/lib/projectTemplates"

// Project templates were only in the New project dialog: the gallery's kinds
// were Docs, Agents, Automations and Tables (PTC-57). They are a kind of the
// gallery now, read from the dialog's own list, and Use template opens New
// project with the template chosen.

const h = vi.hoisted(() => ({
  kind: null as string | null,
  fetched: [] as string[],
  projectReads: [] as boolean[],
  dispatched: [] as unknown[],
  deleted: [] as string[],
  confirm: null as null | { onConfirm: () => Promise<void> | void },
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.kind ? { kind: h.kind } : {}),
}))
vi.mock("react-redux", () => ({ useDispatch: () => (a: unknown) => h.dispatched.push(a) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useConfirm", () => ({
  useConfirm: () => (c: { onConfirm: () => Promise<void> | void }) => {
    h.confirm = c
  },
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    h.fetched.push(url)
    return url
      ? {
          data: {
            data: [
              { id: "m1", kind: "agent", name: "Release Captain", description: "Runs the release checklist.", payload: "{}", created_by: "u", created_at: "", updated_at: "", author_name: "Sam Rivera" },
            ],
          },
          isLoading: false,
          isError: false,
          mutate: vi.fn(),
        }
      : { data: undefined, isLoading: false, isError: false, mutate: vi.fn() }
  },
}))

const builtIn: TemplateSummary = {
  id: "client-project",
  name: "Client project",
  description: "Kickoff to handover, for work you do for a client.",
  built_in: true,
  task_count: 9,
  preview: ["Kickoff call", "Write the brief", "First draft", "Client review"],
  can_delete: false,
}
const saved: TemplateSummary = {
  id: "7a6b5c4d-0000-4000-8000-0000000000aa",
  name: "Launch checklist",
  description: "",
  built_in: false,
  task_count: 3,
  preview: ["Press kit", "Status page", "Tweet"],
  created_by: "Maya Chen",
  can_delete: true,
}
vi.mock("@/hooks/useProjectTemplates", () => ({
  useProjectTemplates: (enabled = true) => {
    h.projectReads.push(enabled)
    return { templates: enabled ? [builtIn, saved] : [], isLoading: false, isError: false, retry: vi.fn() }
  },
  deleteTemplate: async (id: string) => {
    h.deleted.push(id)
  },
}))

const { default: TemplatesPage } = await import("./page")

afterEach(() => {
  cleanup()
  h.kind = null
  h.fetched.length = 0
  h.projectReads.length = 0
  h.dispatched.length = 0
  h.deleted.length = 0
  h.confirm = null
})

const cards = () => Array.from(document.querySelectorAll("[data-template-card]")).map((c) => c.getAttribute("data-template-card"))

describe("project templates in the gallery (PTC-57)", () => {
  it("lists them with everything under All, and alone under Projects, where nothing else is read", () => {
    render(<TemplatesPage />)
    expect(cards()).toEqual(["agent", "project", "project"])
    fireEvent.click(screen.getByRole("button", { name: "Projects" }))
    expect(cards()).toEqual(["project", "project"])
    expect(h.fetched.at(-1)).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Agents" }))
    expect(cards()).toEqual(["agent"])
    expect(h.projectReads.at(-1)).toBe(false)
  })

  it("opens on them from a link to ?kind=project", () => {
    h.kind = "project"
    render(<TemplatesPage />)
    expect(cards()).toEqual(["project", "project"])
  })

  it("shows one's shape and first tasks, and Use template opens New project with it chosen", () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByText("Client project"))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Project · 9 tasks")).toBeTruthy()
    const first = within(dialog).getByRole("list", { name: "Its first tasks" })
    expect(within(first).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Kickoff call", "Write the brief", "First draft", "Client review", "and 5 more"])
    // A built-in template is everyone's: nobody deletes it.
    expect(within(dialog).queryByRole("button", { name: /Delete/ })).toBeNull()
    fireEvent.click(within(dialog).getByRole("button", { name: "Use template" }))
    expect(h.dispatched).toEqual([{ type: "ui/openUI", payload: { key: "createProject", data: { templateId: "client-project" } } }])
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("deletes a saved one after one question", async () => {
    render(<TemplatesPage />)
    fireEvent.click(screen.getByText("Launch checklist"))
    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByText("Project · 3 tasks · by Maya Chen")).toBeTruthy()
    fireEvent.click(within(dialog).getByRole("button", { name: /Delete/ }))
    expect(h.deleted).toEqual([])
    await h.confirm!.onConfirm()
    expect(h.deleted).toEqual([saved.id])
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
  })
})
